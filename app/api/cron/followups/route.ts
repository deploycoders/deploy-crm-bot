import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";

/**
 * Endpoint de ejecución de seguimientos programados fuera de ventana de 24h.
 * Diseñado para invocarse periódicamente (ej. Vercel Cron cada 15 minutos o trigger manual).
 */
export async function GET(request: NextRequest) {
  return handleCronFollowups(request);
}

export async function POST(request: NextRequest) {
  return handleCronFollowups(request);
}

async function handleCronFollowups(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // Si CRON_SECRET está configurado, validar que coincida
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado para ejecutar cron" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();

  try {
    // 1. Obtener hasta 25 seguimientos pendientes que ya hayan alcanzado su hora de envío
    const { data: followups, error } = await supabase
      .from("scheduled_followups")
      .select(`
        id,
        tenant_id,
        conversation_id,
        contact_id,
        template_name,
        retry_count,
        contacts(phone, name)
      `)
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .limit(25);

    if (error) {
      console.error("[Cron Followups] Error consultando seguimientos:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!followups || followups.length === 0) {
      return NextResponse.json({ processed: 0, message: "No hay seguimientos pendientes en este momento" });
    }

    console.log(`[Cron Followups] Procesando ${followups.length} seguimiento(s) programado(s)...`);

    const results = [];

    for (const item of followups) {
      const phone = (item.contacts as any)?.phone;
      if (!phone) {
        await supabase
          .from("scheduled_followups")
          .update({ status: "failed", last_error: "Contacto sin número de teléfono" })
          .eq("id", item.id);
        continue;
      }

      // 2. Enviar plantilla oficial de Meta
      const sendResult = await sendWhatsAppTemplate(
        phone,
        item.template_name,
        "es",
        [],
        { tenantId: item.tenant_id }
      );

      if (sendResult.success) {
        // Marcar como enviado con éxito
        await supabase
          .from("scheduled_followups")
          .update({
            status: "sent",
            executed_at: new Date().toISOString(),
            last_error: null,
          })
          .eq("id", item.id);

        // Guardar mensaje de plantilla en el historial del chat
        const templateContent = `📋 [Seguimiento automático con Plantilla: ${item.template_name}]`;
        await supabase.from("messages").insert({
          tenant_id: item.tenant_id,
          conversation_id: item.conversation_id,
          sender: "bot",
          content: templateContent,
        });

        await supabase
          .from("conversations")
          .update({
            last_message_preview: templateContent,
            last_message_at: new Date().toISOString(),
          })
          .eq("tenant_id", item.tenant_id)
          .eq("id", item.conversation_id);

        results.push({ id: item.id, phone, status: "sent" });
      } else {
        const nextRetry = (item.retry_count || 0) + 1;
        const willFailPermanently = nextRetry >= 3;

        await supabase
          .from("scheduled_followups")
          .update({
            status: willFailPermanently ? "failed" : "pending",
            retry_count: nextRetry,
            last_error: JSON.stringify(sendResult.error || "Fallo en envío de plantilla"),
          })
          .eq("id", item.id);

        results.push({
          id: item.id,
          phone,
          status: willFailPermanently ? "failed_max_retries" : "retry_scheduled",
          error: sendResult.error,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results,
    });
  } catch (err: any) {
    console.error("[Cron Followups] Excepción:", err);
    return NextResponse.json({ error: err?.message || "Error procesando cron" }, { status: 500 });
  }
}
