import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { scheduleAIResponse } from "@/lib/debounce";

// 1. Verificación del Webhook por parte de Meta (GET)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "crm_bot_secret_token_2026";

  if (mode === "subscribe" && token === verifyToken) {
    console.log("✅ Webhook verificado con éxito por Meta");
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("❌ Fallo de verificación de Webhook: Token incorrecto");
  return new NextResponse("Token de verificación no válido", { status: 403 });
}

// Caché global en memoria para deduplicar mensajes reintentados por Meta
const processedMessageIds = new Map<string, number>();

function isDuplicateMessage(msgId: string): boolean {
  if (!msgId) return false;
  const now = Date.now();
  // Limpiar mensajes con más de 10 minutos
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (now - timestamp > 10 * 60 * 1000) {
      processedMessageIds.delete(id);
    }
  }
  if (processedMessageIds.has(msgId)) {
    return true;
  }
  processedMessageIds.set(msgId, now);
  return false;
}

// 2. Recepción y procesamiento de Mensajes entrantes de WhatsApp (POST)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entries = body.entry;
    if (!entries || entries.length === 0) {
      return NextResponse.json({ status: "ignored" });
    }

    const supabase = getSupabaseAdmin();

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        if (!value || !value.messages) continue;

        const contactProfile = value.contacts?.[0];
        const contactName = contactProfile?.profile?.name || "Cliente WhatsApp";

        for (const msg of value.messages) {
          // DEDUPLICACIÓN: Evitar responder dos veces si Meta reintenta el webhook
          if (msg.id && isDuplicateMessage(msg.id)) {
            console.log(`⏩ Mensaje duplicado ${msg.id} de WhatsApp ignorado (reintento de Meta).`);
            continue;
          }

          const fromPhone = `+${msg.from}`;
          let messageText = "";

          if (msg.type === "text") {
            messageText = msg.text.body;
          } else if (msg.type === "audio") {
            messageText = "[Nota de voz recibida]";
          } else if (msg.type === "image") {
            messageText = msg.image?.caption || "[Imagen recibida]";
          } else {
            messageText = `[Mensaje de tipo ${msg.type}]`;
          }

          // A. Buscar o crear el contacto
          let contactId: string | null = null;
          const { data: existingContact } = await supabase
            .from("contacts")
            .select("id, name")
            .eq("phone", fromPhone)
            .single();

          if (existingContact) {
            contactId = existingContact.id;
          } else {
            const { data: newContact, error: contactError } = await supabase
              .from("contacts")
              .insert({ phone: fromPhone, name: contactName })
              .select("id")
              .single();

            if (contactError) {
              console.error("Error al crear contacto:", contactError);
              continue;
            }
            contactId = newContact.id;
          }

          // B. Buscar o crear la conversación
          let conversationId: string | null = null;
          let convStatus = "ai_active";

          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, status")
            .eq("contact_id", contactId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (existingConv) {
            conversationId = existingConv.id;
            convStatus = existingConv.status;
          } else {
            const { data: newConv, error: convError } = await supabase
              .from("conversations")
              .insert({
                contact_id: contactId,
                channel: "whatsapp",
                status: "ai_active",
                last_message_preview: messageText,
                last_message_at: new Date().toISOString(),
              })
              .select("id, status")
              .single();

            if (convError) {
              console.error("Error al crear conversación:", convError);
              continue;
            }
            conversationId = newConv.id;
            convStatus = newConv.status;
          }

          // C. Guardar el mensaje entrante del cliente
          await supabase.from("messages").insert({
            conversation_id: conversationId,
            sender: "client",
            content: messageText,
          });

          // Actualizar vista previa
          await supabase
            .from("conversations")
            .update({
              last_message_preview: messageText,
              last_message_at: new Date().toISOString(),
            })
            .eq("id", conversationId);

          console.log(`📩 Mensaje de ${fromPhone}: "${messageText}" | Estado: ${convStatus}`);

          // D. LÓGICA DE DECISIÓN: ¿Responde la IA o interviene el humano?
          // Si la conversación estaba resuelta y el cliente vuelve a escribir, reactivar la IA
          if (convStatus === "resolved") {
            convStatus = "ai_active";
            await supabase
              .from("conversations")
              .update({ status: "ai_active" })
              .eq("id", conversationId);
          }

          // Si el cliente estaba en waiting_agent pero escribe pidiendo el bot o seleccionando opciones del menú
          if (convStatus === "waiting_agent") {
            const wantsBot = /^(bot|menu|menú|reiniciar|activar bot|volver|inicio|opciones|1|2|3|4)$/i.test(messageText.trim());
            if (wantsBot) {
              convStatus = "ai_active";
              await supabase
                .from("conversations")
                .update({ status: "ai_active" })
                .eq("id", conversationId);
              await supabase.from("messages").insert({
                conversation_id: conversationId,
                sender: "system",
                content: "El cliente solicitó interactuar nuevamente con el Bot IA.",
              });
            }
          }

          if (convStatus === "ai_active" && conversationId) {
            // Buffer y Debounce Inteligente:
            // Si el cliente envía varios mensajes seguidos, el temporizador se reinicia
            // y el bot espera que deje de escribir para responder con un solo mensaje unificado.
            scheduleAIResponse(conversationId, fromPhone, contactName);
          } else {
            console.log(`⏸️ IA silenciada para ${fromPhone} (Estado: ${convStatus}). El asesor responderá.`);
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error("Error en Webhook de WhatsApp:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
