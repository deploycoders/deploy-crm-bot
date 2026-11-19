/**
 * app/api/chat/send/route.ts
 * Endpoint seguro para que el asesor envíe mensajes por WhatsApp.
 * Valida autenticación estricta y aislamiento por tenant activo.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendWhatsAppDocument,
  sendWhatsAppTemplate,
} from "@/lib/whatsapp";
import { cancelPendingDebounce } from "@/lib/debounce";
import { getTenantContext } from "@/lib/tenant";

// Rate limiting server-side (por conversationId)
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, retryAfterMs: 0 };
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, retryAfterMs: 0 };
}

// Auditoría interna asíncrona dentro del tenant
async function recordAudit(
  tenantId: string,
  action: string,
  userId: string,
  userName: string,
  conversationId: string,
  metadata?: Record<string, unknown>
) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("audit_log").insert({
      tenant_id: tenantId,
      action,
      user_id: userId,
      user_name: userName,
      conversation_id: conversationId,
      metadata,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[send:audit] No se pudo guardar evento de auditoría:", err);
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── 0. Validar contexto de Tenant autenticado ──────────────────────────
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización seleccionada" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      conversationId,
      text,
      type = "text",
      mediaUrl,
      filename,
      agentId = tenant.userId,
      agentName = "Asesor",
    } = body;

    // ── Validaciones de entrada ──────────────────────────────────────────────
    if (!conversationId) {
      return NextResponse.json(
        { error: "Falta parámetro conversationId" },
        { status: 400 }
      );
    }

    if (!text && !mediaUrl) {
      return NextResponse.json(
        { error: "Debe proporcionar texto o una URL de archivo multimedia" },
        { status: 400 }
      );
    }

    const allowedTypes = ["text", "image", "document", "template"];
    if (!allowedTypes.includes(type)) {
      return NextResponse.json(
        { error: `Tipo de mensaje inválido: ${type}. Permitidos: ${allowedTypes.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Rate Limiting ─────────────────────────────────────────────────────────
    const rl = checkRateLimit(`conv:${conversationId}`);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Límite de velocidad alcanzado. Espera antes de enviar más mensajes.",
          retryAfterMs: rl.retryAfterMs,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    // Cancelar respuesta pendiente del bot
    cancelPendingDebounce(conversationId);

    const supabase = getSupabaseAdmin();

    // ── 1. Obtener conversación validando el Tenant ──────────────────────────
    const { data: conv, error: convError } = await supabase
      .from("conversations")
      .select("id, contact_id, tenant_id, last_customer_message_at, contacts(phone)")
      .eq("id", conversationId)
      .eq("tenant_id", tenant.tenantId)
      .single();

    if (convError || !conv) {
      return NextResponse.json(
        { error: "Conversación no encontrada en la organización activa" },
        { status: 404 }
      );
    }

    const phone = (conv.contacts as any)?.phone;
    if (!phone) {
      return NextResponse.json(
        { error: "El contacto no tiene teléfono asignado" },
        { status: 400 }
      );
    }

    // ── 2. Enviar por WhatsApp Cloud API usando credenciales del Tenant ──────
    let waResult: { success: boolean; messageId?: string; error?: any; isWindowError?: boolean };
    let savedContent = text || "";
    const sendOpts = { tenantId: tenant.tenantId };

    if (type === "template") {
      const templateName = body.templateName || "seguimiento_comercial";
      const languageCode = body.languageCode || "es";
      const components = body.templateComponents || [];

      waResult = await sendWhatsAppTemplate(phone, templateName, languageCode, components, sendOpts);
      savedContent = `📋 [Plantilla Meta: ${templateName}] ${text || ""}`.trim();
    } else if (type === "image" && mediaUrl) {
      waResult = await sendWhatsAppImage(phone, mediaUrl, text, sendOpts);
      savedContent = text
        ? `📷 [Imagen]: ${text}\n${mediaUrl}`
        : `📷 [Imagen]: ${mediaUrl}`;
    } else if (type === "document" && mediaUrl) {
      waResult = await sendWhatsAppDocument(phone, mediaUrl, filename || "documento.pdf", text, sendOpts);
      savedContent = text
        ? `📄 [Documento ${filename || "PDF"}]: ${text}\n${mediaUrl}`
        : `📄 [Documento ${filename || "PDF"}]: ${mediaUrl}`;
    } else {
      waResult = await sendWhatsAppMessage(phone, text, sendOpts);
      savedContent = text;
    }

    if (!waResult.success) {
      console.error(`[send] Error enviando WhatsApp en tenant ${tenant.tenantId}:`, waResult.error);
      if (waResult.isWindowError) {
        return NextResponse.json(
          {
            error:
              "Ventana de 24 horas de WhatsApp cerrada (Error 131047). Para contactar a este cliente debes enviar una plantilla preaprobada por Meta.",
            isWindowError: true,
          },
          { status: 403 }
        );
      }
    }

    // ── 3. Guardar mensaje en Supabase con tenant_id ──────────────────────────
    const messageInsertData: Record<string, unknown> = {
      tenant_id: tenant.tenantId,
      conversation_id: conversationId,
      sender: "agent",
      content: savedContent,
    };

    if (mediaUrl) {
      messageInsertData.media_url = mediaUrl;
      messageInsertData.media_type = type;
    }

    const { data: newMsg, error: msgError } = await supabase
      .from("messages")
      .insert(messageInsertData)
      .select()
      .single();

    if (msgError) {
      console.error("[send] Error guardando mensaje en Supabase:", msgError);
      throw msgError;
    }

    // ── 4. Actualizar conversación dentro del Tenant a human_takeover ─────────
    await supabase
      .from("conversations")
      .update({
        status: "human_takeover",
        last_message_preview: savedContent,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("tenant_id", tenant.tenantId);

    // ── 5. Registrar auditoría con tenant_id ──────────────────────────────────
    recordAudit(
      tenant.tenantId,
      "agent:message_sent",
      agentId,
      agentName,
      conversationId,
      {
        type,
        preview: savedContent.slice(0, 100),
        whatsappDelivered: waResult.success,
      }
    );

    return NextResponse.json({
      success: true,
      message: newMsg,
      whatsappDelivered: waResult.success,
      ...(waResult.error ? { whatsappError: waResult.error } : {}),
      rateLimitRemaining: rl.remaining,
    });
  } catch (error: unknown) {
    console.error("[send] Error en /api/chat/send:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
