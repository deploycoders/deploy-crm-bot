import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  generateAIResponse,
  cleanJsonArtifacts,
  transcribeAudioWithGemini,
  generateHandoffSummary,
} from "@/lib/ai";
import { sendWhatsAppMessage, downloadWhatsAppMedia } from "@/lib/whatsapp";

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
          } else if (msg.type === "audio" || msg.type === "voice") {
            const mediaId = msg.audio?.id || msg.voice?.id;
            if (mediaId) {
              console.log(`🎙️ Descargando y transcribiendo nota de voz de ${fromPhone} (Media ID: ${mediaId})...`);
              const downloaded = await downloadWhatsAppMedia(mediaId);
              if (downloaded) {
                const transcription = await transcribeAudioWithGemini(
                  downloaded.buffer,
                  downloaded.mimeType
                );
                messageText = `🎤 [Nota de voz]: "${transcription}"`;
                console.log(`✅ Nota de voz transcrita para ${fromPhone}: "${transcription}"`);
              } else {
                messageText = "🎤 [Nota de voz recibida]";
              }
            } else {
              messageText = "🎤 [Nota de voz recibida]";
            }
          } else if (msg.type === "image") {
            messageText = msg.image?.caption ? `📷 [Imagen]: ${msg.image.caption}` : "📷 [Imagen recibida]";
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

          // C. Guardar el mensaje entrante del cliente y obtener su ID
          let currentMsgId: string | null = null;
          const { data: insertedMsg, error: msgInsertErr } = await supabase
            .from("messages")
            .insert({
              conversation_id: conversationId,
              sender: "client",
              content: messageText,
            })
            .select("id")
            .single();

          if (msgInsertErr) {
            console.error("Error al insertar mensaje del cliente:", msgInsertErr);
          } else if (insertedMsg) {
            currentMsgId = insertedMsg.id;
          }

          // Actualizar vista previa de la conversación
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

          // Si el cliente estaba en waiting_agent o human_takeover pero escribe pidiendo el bot o seleccionando opciones del menú
          if (convStatus === "waiting_agent" || convStatus === "human_takeover") {
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
            // Buffer y Debounce Serverless Seguro:
            // Esperamos 3.5 segundos dentro de la solicitud para que si el cliente envía varios mensajes
            // seguidos, el bot los consolide y responda con un único mensaje unificado.
            const DEBOUNCE_WAIT_MS = 3500;
            console.log(`⏳ Esperando ${DEBOUNCE_WAIT_MS / 1000}s para ver si el cliente ${fromPhone} envía más mensajes...`);
            await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_MS));

            // Consultar si ha entrado un mensaje más nuevo de este cliente después de este
            if (currentMsgId) {
              const { data: latestClientMsgs } = await supabase
                .from("messages")
                .select("id, created_at")
                .eq("conversation_id", conversationId)
                .eq("sender", "client")
                .order("created_at", { ascending: false })
                .limit(1);

              const latestId = latestClientMsgs?.[0]?.id;
              if (latestId && latestId !== currentMsgId) {
                console.log(`⏩ Mensaje posterior detectado (${latestId} vs ${currentMsgId}) para ${fromPhone}. Este webhook delega la respuesta al mensaje más reciente.`);
                continue;
              }
            }

            // Verificar si el estado de la conversación sigue siendo ai_active (por si intervino un asesor)
            const { data: currentConv } = await supabase
              .from("conversations")
              .select("status")
              .eq("id", conversationId)
              .single();

            if (currentConv && currentConv.status !== "ai_active") {
              console.log(`⏸️ IA silenciada para ${fromPhone} (Estado actual: ${currentConv.status}).`);
              continue;
            }

            // 1. Obtener historial reciente para memoria de la IA
            const { data: historyMsgs } = await supabase
              .from("messages")
              .select("sender, content, created_at")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true })
              .limit(20);

            // 2. Identificar los mensajes del cliente acumulados desde la última respuesta del bot o asesor
            let lastBotIdx = -1;
            if (historyMsgs) {
              for (let i = historyMsgs.length - 1; i >= 0; i--) {
                if (historyMsgs[i].sender === "bot" || historyMsgs[i].sender === "agent") {
                  lastBotIdx = i;
                  break;
                }
              }
            }

            const unrepliedClientMsgs = (historyMsgs || [])
              .slice(lastBotIdx + 1)
              .filter((m) => m.sender === "client");

            const combinedClientText = unrepliedClientMsgs.length > 0
              ? unrepliedClientMsgs.map((m) => m.content.trim()).filter(Boolean).join("\n")
              : messageText;

            const priorHistory = (historyMsgs || []).slice(0, lastBotIdx + 1);

            console.log(`🤖 Generando respuesta consolidada para ${fromPhone} (${unrepliedClientMsgs.length} mensaje(s)): "${combinedClientText.replace(/\n/g, " // ")}"`);

            // 3. Generar respuesta con Gemini
            const aiResult = await generateAIResponse(
              priorHistory as any,
              combinedClientText
            );
            const finalReplyText = cleanJsonArtifacts(aiResult.replyText);
            console.log(`🤖 Respuesta IA generada: "${finalReplyText.slice(0, 80)}..." | Handoff: ${aiResult.requestHandoff}`);

            // 4. Enviar respuesta por WhatsApp
            const waResult = await sendWhatsAppMessage(fromPhone, finalReplyText);
            if (!waResult.success) {
              console.error("❌ Error enviando mensaje a WhatsApp:", JSON.stringify(waResult.error));
            } else {
              console.log(`✅ Mensaje enviado a WhatsApp para ${fromPhone}`);
            }

            // 5. Guardar respuesta del bot en Supabase
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender: "bot",
              content: finalReplyText,
            });

            // 6. Si la IA detecta que el cliente necesita un asesor humano (Handoff)
            if (aiResult.requestHandoff) {
              console.log(`📋 Generando Ficha Ejecutiva de Transferencia con IA para ${fromPhone}...`);
              const handoffSummary = await generateHandoffSummary(
                (historyMsgs || []) as any,
                combinedClientText,
                aiResult.handoffReason
              );

              await supabase
                .from("conversations")
                .update({
                  status: "waiting_agent",
                  last_message_preview: finalReplyText,
                  last_message_at: new Date().toISOString(),
                })
                .eq("id", conversationId);

              // Guardar la tarjeta ejecutiva estructurada para el asesor
              const summaryCardContent = JSON.stringify({
                type: "handoff_summary_card",
                executiveSummary: handoffSummary.executiveSummary,
                clientInterest: handoffSummary.clientInterest,
                urgencyLevel: handoffSummary.urgencyLevel,
                recommendedAction: handoffSummary.recommendedAction,
                reason: aiResult.handoffReason || "Lead Calificado",
              });

              await supabase.from("messages").insert({
                conversation_id: conversationId,
                sender: "system",
                content: summaryCardContent,
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
