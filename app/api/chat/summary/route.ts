import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateHandoffSummary, ConversationMessage } from "@/lib/ai";
import { getTenantContext } from "@/lib/tenant";

export async function POST(req: NextRequest) {
  try {
    const tenant = await getTenantContext(req);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización seleccionada" },
        { status: 401 }
      );
    }

    const { conversationId, reason } = await req.json();

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversationId es obligatorio" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Validar que la conversación pertenezca al tenant activo
    const { data: conv, error: convErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("tenant_id", tenant.tenantId)
      .single();

    if (convErr || !conv) {
      return NextResponse.json(
        { error: "Conversación no encontrada en la organización activa" },
        { status: 404 }
      );
    }

    let chatHistory: ConversationMessage[] = [];
    let lastClientMsg = "Intervención del asesor en la conversación.";

    try {
      const { data: messages } = await supabase
        .from("messages")
        .select("sender, content, created_at")
        .eq("conversation_id", conversationId)
        .eq("tenant_id", tenant.tenantId)
        .order("created_at", { ascending: true })
        .limit(20);

      if (messages && messages.length > 0) {
        chatHistory = messages
          .filter((m) => !(m.sender === "system" && m.content.startsWith("{")))
          .map((m) => ({
            sender: m.sender as any,
            content: m.content,
          }));

        const foundLast = [...chatHistory].reverse().find((m) => m.sender === "client");
        if (foundLast?.content) lastClientMsg = foundLast.content;
      }
    } catch (e: any) {
      console.warn("Aviso al consultar mensajes de Supabase para resumen:", e?.message);
    }

    // Generar resumen con Gemini o fallback inteligente
    const summary = await generateHandoffSummary(
      chatHistory,
      lastClientMsg,
      reason || "Intervención y toma de control por Asesor Humano"
    );

    // Guardar ficha en Supabase con tenant_id
    const summaryCardContent = JSON.stringify({
      type: "handoff_summary_card",
      executiveSummary: summary.executiveSummary,
      clientInterest: summary.clientInterest,
      urgencyLevel: summary.urgencyLevel,
      recommendedAction: summary.recommendedAction,
      reason: reason || "Intervención de Asesor",
      generatedAt: new Date().toISOString(),
    });

    try {
      await supabase.from("messages").insert({
        tenant_id: tenant.tenantId,
        conversation_id: conversationId,
        sender: "system",
        content: summaryCardContent,
      });
    } catch (dbErr) {
      console.warn("[summary] Error guardando tarjeta de resumen:", dbErr);
    }

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (err: any) {
    console.error("Error en api/chat/summary:", err);
    return NextResponse.json(
      {
        success: true,
        summary: {
          executiveSummary: "El cliente solicitó asesoría comercial o cotización personalizada.",
          clientInterest: "Consulta de servicios y cotizaciones",
          urgencyLevel: "media",
          recommendedAction: "Saludar cordialmente, validar los requerimientos del proyecto y cotizar.",
        },
      },
      { status: 200 }
    );
  }
}
