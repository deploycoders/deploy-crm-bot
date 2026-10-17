import { getSupabaseAdmin } from "./supabase";
import { generateAIResponse } from "./ai";
import { sendWhatsAppMessage } from "./whatsapp";

interface DebounceEntry {
  timer: NodeJS.Timeout;
  conversationId: string;
  fromPhone: string;
  contactName: string;
  firstTimestamp: number;
  lastTimestamp: number;
}

// Mapa en memoria para almacenar las conversaciones en espera de que el usuario termine de escribir
const pendingConversations = new Map<string, DebounceEntry>();

// Tiempo de espera para que el cliente termine de escribir (7 segundos por defecto).
// Si el cliente envía otro mensaje dentro de este tiempo, el temporizador se reinicia.
const DEBOUNCE_DELAY_MS = Number(process.env.WHATSAPP_DEBOUNCE_MS) || 7000;
// Tiempo máximo acumulado (30 segundos) para evitar demoras excesivas si escribe sin parar.
const MAX_WAIT_MS = 30000;

/**
 * Cancela cualquier temporizador pendiente para una conversación (por ejemplo si un asesor humano interviene).
 */
export function cancelPendingDebounce(conversationId: string) {
  const existing = pendingConversations.get(conversationId);
  if (existing) {
    clearTimeout(existing.timer);
    pendingConversations.delete(conversationId);
    console.log(`⏹️ Debounce cancelado para conversación ${conversationId}`);
  }
}

/**
 * Registra o reinicia el temporizador de espera para responder a un cliente.
 * Si el cliente envía varios mensajes seguidos, el bot espera a que deje de escribir
 * para consolidar todas sus consultas y enviar una sola respuesta unificada.
 */
export function scheduleAIResponse(
  conversationId: string,
  fromPhone: string,
  contactName: string
) {
  const now = Date.now();
  const existing = pendingConversations.get(conversationId);

  let firstTimestamp = now;

  if (existing) {
    // Cancelamos el temporizador anterior
    clearTimeout(existing.timer);
    firstTimestamp = existing.firstTimestamp;

    // Si ya ha pasado el tiempo máximo de espera total (ej. 30s), procesar de inmediato
    if (now - firstTimestamp >= MAX_WAIT_MS) {
      console.log(`⏱️ Límite máximo de espera alcanzado (${MAX_WAIT_MS / 1000}s) para ${fromPhone}. Procesando respuesta acumulada.`);
      pendingConversations.delete(conversationId);
      processDebouncedConversation(conversationId, fromPhone).catch((err) =>
        console.error("❌ Error en processDebouncedConversation:", err)
      );
      return;
    }
  }

  console.log(`⏳ Mensaje recibido de ${fromPhone}. Esperando ${DEBOUNCE_DELAY_MS / 1000}s a que termine de escribir para responder...`);

  const timer = setTimeout(() => {
    pendingConversations.delete(conversationId);
    processDebouncedConversation(conversationId, fromPhone).catch((err) =>
      console.error("❌ Error en processDebouncedConversation:", err)
    );
  }, DEBOUNCE_DELAY_MS);

  pendingConversations.set(conversationId, {
    timer,
    conversationId,
    fromPhone,
    contactName,
    firstTimestamp,
    lastTimestamp: now,
  });
}

/**
 * Procesa todos los mensajes acumulados del cliente y genera una única respuesta con IA.
 */
async function processDebouncedConversation(conversationId: string, fromPhone: string) {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Verificar el estado actual de la conversación
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id, status")
      .eq("id", conversationId)
      .single();

    if (convErr || !conv) {
      console.warn(`⚠️ Conversación ${conversationId} no encontrada.`);
      return;
    }

    if (conv.status !== "ai_active") {
      console.log(`⏸️ IA en pausa para ${fromPhone} (Estado actual: '${conv.status}'). Se omite respuesta automática.`);
      return;
    }

    // 2. Obtener el historial reciente de mensajes
    const { data: messages, error: msgErr } = await supabase
      .from("messages")
      .select("sender, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    if (msgErr || !messages || messages.length === 0) {
      console.warn(`⚠️ No se encontraron mensajes en la conversación ${conversationId}`);
      return;
    }

    // 3. Identificar todos los mensajes consecutivos del cliente desde la última respuesta del bot o asesor
    let lastBotOrAgentIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender === "bot" || messages[i].sender === "agent") {
        lastBotOrAgentIdx = i;
        break;
      }
    }

    const unrepliedClientMsgs = messages
      .slice(lastBotOrAgentIdx + 1)
      .filter((m) => m.sender === "client");

    if (unrepliedClientMsgs.length === 0) {
      console.log(`ℹ️ No hay mensajes nuevos del cliente pendientes de respuesta en ${conversationId}`);
      return;
    }

    // Unir todos los mensajes que el cliente envió durante la ráfaga
    const combinedMessageText = unrepliedClientMsgs
      .map((m) => m.content.trim())
      .filter(Boolean)
      .join("\n");

    console.log(`📥 Agrupados ${unrepliedClientMsgs.length} mensaje(s) del cliente ${fromPhone}:\n"${combinedMessageText}"`);

    // Historial previo a este bloque de mensajes del cliente
    const historyForAI = messages.slice(0, lastBotOrAgentIdx + 1);

    // 4. Generar una única respuesta consolidada con Gemini
    const aiResult = await generateAIResponse(
      historyForAI as any,
      combinedMessageText
    );

    console.log(`🤖 Respuesta IA única generada: "${aiResult.replyText.slice(0, 100)}..." | Handoff: ${aiResult.requestHandoff}`);

    // 5. Enviar la respuesta única por WhatsApp
    const waResult = await sendWhatsAppMessage(fromPhone, aiResult.replyText);
    if (!waResult.success) {
      console.error("❌ Error enviando mensaje a WhatsApp:", JSON.stringify(waResult.error));
    } else {
      console.log(`✅ Respuesta unificada enviada a WhatsApp para ${fromPhone}`);
    }

    // 6. Guardar la respuesta del bot en Supabase
    await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender: "bot",
      content: aiResult.replyText,
    });

    // 7. Si la IA detectó solicitud de asesor humano (Handoff)
    if (aiResult.requestHandoff) {
      await supabase
        .from("conversations")
        .update({
          status: "waiting_agent",
          last_message_preview: aiResult.replyText,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);

      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender: "system",
        content: `La IA detectó intención de asesor: ${aiResult.handoffReason || "Lead calificado"}. Conversación marcada como 'Esperando Asesor'.`,
      });
    } else {
      await supabase
        .from("conversations")
        .update({
          last_message_preview: aiResult.replyText,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
    }
  } catch (err) {
    console.error("❌ Error inesperado al procesar mensajes en debounce:", err);
  }
}
