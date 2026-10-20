/**
 * app/api/chat/send/route.ts
 * Endpoint para que el asesor humano envíe mensajes por WhatsApp.
 *
 * Mejoras Fase 5:
 *  - Rate limiting server-side (máx 20 msg/min por conversationId)
 *  - Registro de auditoría automático en /api/audit
 *  - Validación de tipo de mensaje más robusta
 *  - Mejor manejo de errores con códigos específicos
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendWhatsAppMessage,
  sendWhatsAppImage,
  sendWhatsAppDocument,
} from "@/lib/whatsapp";
import { cancelPendingDebounce } from "@/lib/debounce";

// ──────────────────────────────────────────────────────────────────────────────
// Rate limiting server-side (por conversationId)
// Máx 20 mensajes por ventana de 60 segundos
// ──────────────────────────────────────────────────────────────────────────────
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 60 segundos

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // Nueva ventana
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

// ──────────────────────────────────────────────────────────────────────────────
// Función helper para registrar auditoría (fire-and-forget)
// ──────────────────────────────────────────────────────────────────────────────
function auditLog(
  action: string,
  userId: string,
  userName: string,
  conversationId: string,
  metadata?: Record<string, unknown>
) {
  // Fire and forget — no bloquea el response
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      userId,
      userName,
      conversationId,
      metadata,
      timestamp: new Date().toISOString(),
    }),
  }).catch(() => {
    // El audit no debe interrumpir el flujo principal
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST Handler
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      conversationId,
      text,
      type = "text",
      mediaUrl,
      filename,
      // Metadata del asesor (opcional, enviada por el cliente)
      agentId = "unknown",
      agentName = "Asesor",
    } = body;

    // ── Validaciones ──────────────────────────────────────────────────────────
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

    const allowedTypes = ["text", "image", "document"];
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

    // ── Cancelar respuesta pendiente del bot ──────────────────────────────────
    const wasCancelled = cancelPendingDebounce(conversationId);
    if (wasCancelled) {
      console.log(`[send] Respuesta del bot cancelada para ${conversationId} por intervención humana`);
    }

    const supabase = getSupabaseAdmin();

    // ── 1. Obtener conversación y teléfono ────────────────────────────────────
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
      return NextResponse.json(
        { error: "El contacto no tiene teléfono asignado" },
        { status: 400 }
      );
    }

    // ── 2. Enviar por WhatsApp Cloud API ──────────────────────────────────────
    let waResult: { success: boolean; messageId?: string; error?: any };
    let savedContent = text || "";

    if (type === "image" && mediaUrl) {
      waResult = await sendWhatsAppImage(phone, mediaUrl, text);
      savedContent = text
        ? `📷 [Imagen]: ${text}\n${mediaUrl}`
        : `📷 [Imagen]: ${mediaUrl}`;
    } else if (type === "document" && mediaUrl) {
      waResult = await sendWhatsAppDocument(phone, mediaUrl, filename || "documento.pdf", text);
      savedContent = text
        ? `📄 [Documento ${filename || "PDF"}]: ${text}\n${mediaUrl}`
        : `📄 [Documento ${filename || "PDF"}]: ${mediaUrl}`;
    } else {
      waResult = await sendWhatsAppMessage(phone, text);
      savedContent = text;
    }

    if (!waResult.success) {
      console.error("[send] Error al enviar mensaje a WhatsApp:", waResult.error);
      // No abortamos — guardamos el mensaje de todas formas para no perder el historial
    }

    // ── 3. Guardar mensaje en Supabase ────────────────────────────────────────
    const { data: newMsg, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender: "agent",
        content: savedContent,
        ...(waResult.messageId ? { wa_message_id: waResult.messageId } : {}),
      })
      .select()
      .single();

    if (msgError) {
      throw msgError;
    }

    // ── 4. Actualizar conversación → human_takeover ───────────────────────────
    await supabase
      .from("conversations")
      .update({
        status: "human_takeover",
        last_message_preview: savedContent,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    // ── 5. Registrar auditoría (fire-and-forget) ──────────────────────────────
    auditLog("agent:message_sent", agentId, agentName, conversationId, {
      type,
      preview: savedContent.slice(0, 100),
      whatsappDelivered: waResult.success,
    });

    return NextResponse.json({
      success: true,
      message: newMsg,
      whatsappDelivered: waResult.success,
      rateLimitRemaining: rl.remaining,
    });
  } catch (error: unknown) {
    console.error("[send] Error en /api/chat/send:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
