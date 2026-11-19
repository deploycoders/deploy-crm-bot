import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });

    const admin = getSupabaseAdmin();
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult.user) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 401 });
    }

    const user = userResult.user;
    const isSuper =
      user.user_metadata?.role === "superadmin" ||
      user.email?.toLowerCase() === "admin@salesbot.crm" ||
      (user.user_metadata?.permissions as string[])?.includes("*");

    if (!isSuper) {
      return NextResponse.json({ success: false, error: "Acceso denegado" }, { status: 403 });
    }

    const { tenantId } = await request.json();
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId es requerido" }, { status: 400 });
    }

    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .select("id, slug, name, is_active")
      .eq("id", tenantId)
      .single();

    if (tenantErr || !tenant) {
      return NextResponse.json({ success: false, error: "Organización no encontrada" }, { status: 404 });
    }

    // Asegurar que el superadmin tenga membresía activa en este tenant para RLS
    await admin.from("organization_members").upsert(
      {
        tenant_id: tenant.id,
        user_id: user.id,
        role: "owner",
        is_active: true,
      },
      { onConflict: "tenant_id,user_id" }
    );

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        role: "owner",
        isActive: tenant.is_active,
      },
    });
  } catch (error: any) {
    console.error("[admin:tenants:impersonate] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

