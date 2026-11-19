/**
 * app/api/audit/route.ts
 * Endpoint seguro para eventos de Auditoría aislados por Tenant.
 *
 * POST /api/audit — Guarda un AuditEvent asociado al tenant activo
 * GET  /api/audit — Lista los eventos del tenant activo
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext } from "@/lib/tenant";

// POST — Guardar evento de auditoría
export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado para registrar auditoría" },
        { status: 401 }
      );
    }

    const body = await request.json();

    if (!body.action) {
      return NextResponse.json(
        { error: "Falta campo requerido: action" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    try {
      await supabase.from("audit_log").insert({
        tenant_id: tenant.tenantId,
        action: body.action,
        user_id: tenant.userId,
        user_name: body.userName || "Usuario",
        conversation_id: body.conversationId ?? null,
        contact_id: body.contactId ?? null,
        metadata: body.metadata ?? null,
        created_at: body.timestamp ?? new Date().toISOString(),
      });
    } catch (dbErr) {
      console.warn("[audit] Error al insertar en audit_log:", dbErr);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[audit] Error en POST /api/audit:", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

// GET — Obtener eventos del tenant activo
export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

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
      .eq("tenant_id", tenant.tenantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq("user_id", userId);
    if (action) query = query.eq("action", action);

    const { data, error, count } = await query;

    if (error) {
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
