import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateHandoffSummary, ConversationMessage } from "@/lib/ai";

export async function POST(req: NextRequest) {
  try {
    const { conversationId, reason } = await req.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId es obligatorio" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Obtener los últimos mensajes de la conversación
    const { data: messages, error: msgsErr } = await supabase
      .from("messages")
      .select("sender, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(20);

    if (msgsErr) {
      console.error("Error al obtener mensajes para resumen:", msgsErr.message);
      return NextResponse.json({ error: msgsErr.message }, { status: 500 });
    }

    // Filtrar mensajes que no sean del sistema con JSON
    const chatHistory: ConversationMessage[] = (messages || [])
      .filter((m) => !(m.sender === "system" && m.content.startsWith("{")))
      .map((m) => ({
        sender: m.sender as any,
        content: m.content,
      }));

    const lastClientMsg =
      [...chatHistory].reverse().find((m) => m.sender === "client")?.content ||
      "Intervención manual del asesor en la conversación.";

    // Generar resumen con Gemini
    const summary = await generateHandoffSummary(
      chatHistory,
      lastClientMsg,
      reason || "Intervención y toma de control por Asesor Humano"
    );

    // Guardar en la conversación como mensaje de sistema tipo 'handoff_summary_card'
    const summaryCardContent = JSON.stringify({
      type: "handoff_summary_card",
      executiveSummary: summary.executiveSummary,
      clientInterest: summary.clientInterest,
      urgencyLevel: summary.urgencyLevel,
      recommendedAction: summary.recommendedAction,
      reason: reason || "Intervención de Asesor",
      generatedAt: new Date().toISOString(),
    });

    const { data: insertedMsg, error: insertErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender: "system",
        content: summaryCardContent,
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Error al insertar tarjeta de resumen:", insertErr.message);
    }

    return NextResponse.json({
      success: true,
      summary,
      message: insertedMsg,
    });
  } catch (err: any) {
    console.error("Error en api/chat/summary:", err);
    return NextResponse.json(
      { error: err?.message || "Error interno al generar resumen" },
      { status: 500 }
    );
  }
}
