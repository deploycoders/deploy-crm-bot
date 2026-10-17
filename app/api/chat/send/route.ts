import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { cancelPendingDebounce } from "@/lib/debounce";

export async function POST(request: NextRequest) {
  try {
    const { conversationId, text } = await request.json();

    if (!conversationId || !text) {
      return NextResponse.json(
        { error: "Faltan parámetros: conversationId o text" },
        { status: 400 }
      );
    }

    // Cancelar cualquier respuesta pendiente del bot para no interrumpir al asesor humano
    cancelPendingDebounce(conversationId);

    const supabase = getSupabaseAdmin();

    // 1. Obtener los datos de la conversación y el teléfono del contacto
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, contact_id, contacts(phone)")
      .eq("id", conversationId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 });
    }

    const phone = (conv.contacts as any)?.phone;
    if (!phone) {
      return NextResponse.json({ error: "El contacto no tiene teléfono asignado" }, { status: 400 });
    }

    // 2. Enviar el mensaje a través de Meta WhatsApp Cloud API
    const waResult = await sendWhatsAppMessage(phone, text);
    if (!waResult.success) {
      console.error("Error al enviar mensaje a WhatsApp:", waResult.error);
    }

    // 3. Guardar el mensaje en Supabase con sender: 'agent'
    const { data: newMsg, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender: "agent",
        content: text,
      })
      .select()
      .single();

    if (msgError) {
      throw msgError;
    }

    // 4. Actualizar la conversación: pasa a 'human_takeover' (el bot se silencia)
    await supabase
      .from("conversations")
      .update({
        status: "human_takeover",
        last_message_preview: text,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    return NextResponse.json({ success: true, message: newMsg });
  } catch (error: unknown) {
    console.error("Error en /api/chat/send:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
