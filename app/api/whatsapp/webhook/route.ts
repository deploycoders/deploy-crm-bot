import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateAIResponse } from "@/lib/ai";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

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
          if (convStatus === "ai_active") {
            // 1. Obtener historial reciente para memoria
            const { data: history } = await supabase
              .from("messages")
              .select("sender, content")
              .eq("conversation_id", conversationId)
              .order("created_at", { ascending: true })
              .limit(10);

            // 2. Generar respuesta con Gemini
            const aiResult = await generateAIResponse(
              (history || []) as any,
              messageText
            );
            console.log(`🤖 Respuesta IA generada: "${aiResult.replyText}" | Handoff: ${aiResult.requestHandoff}`);

            // 3. Enviar respuesta por WhatsApp
            const waResult = await sendWhatsAppMessage(fromPhone, aiResult.replyText);
            if (!waResult.success) {
              console.error("❌ Error enviando mensaje a WhatsApp:", JSON.stringify(waResult.error));
            } else {
              console.log(`✅ Mensaje enviado a WhatsApp para ${fromPhone}`);
            }

            // 4. Guardar respuesta del bot en Supabase
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              sender: "bot",
              content: aiResult.replyText,
            });

            // 5. Si la IA detecta que el cliente necesita un asesor humano (Handoff)
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
