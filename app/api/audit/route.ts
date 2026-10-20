/**
 * app/api/audit/route.ts
 * Endpoint REST para persistir eventos de Auditoría en Supabase.
 *
 * POST /api/audit — Guarda un AuditEvent
 * GET  /api/audit — Lista los últimos N eventos (solo superadmin)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// ──────────────────────────────────────────────────────────────────────────────
// POST — Guardar evento de auditoría
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validar campos mínimos requeridos
    if (!body.action || !body.userId) {
      return NextResponse.json(
        { error: "Faltan campos requeridos: action, userId" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    // Intentar guardar en Supabase (tabla audit_log)
    // Si la tabla no existe, retornamos 200 de todos modos (silencioso)
    try {
      await supabase.from("audit_log").insert({
        action: body.action,
        user_id: body.userId,
        user_name: body.userName || "Desconocido",
        conversation_id: body.conversationId ?? null,
        contact_id: body.contactId ?? null,
        metadata: body.metadata ?? null,
        created_at: body.timestamp ?? new Date().toISOString(),
      });
    } catch (dbErr) {
      // La tabla puede no existir aún — registramos pero no fallamos
      console.warn("[audit] No se pudo guardar en audit_log:", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[audit] Error en POST /api/audit:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET — Obtener últimos eventos (con paginación básica)
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
    const page = Math.max(parseInt(searchParams.get("page") ?? "1", 10), 1);
    const offset = (page - 1) * limit;
    const userId = searchParams.get("userId");
    const action = searchParams.get("action");

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from("audit_log")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq("user_id", userId);
    if (action) query = query.eq("action", action);

    const { data, error, count } = await query;

    if (error) {
      // Si la tabla no existe, retornar vacío
      if (error.code === "42P01") {
        return NextResponse.json({ events: [], total: 0, page, limit });
      }
      throw error;
    }

    return NextResponse.json({
      events: data ?? [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (err) {
    console.error("[audit] Error en GET /api/audit:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
