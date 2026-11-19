import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/tenants
 * Retorna las organizaciones donde el usuario autenticado tiene membresía activa.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult.user) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 401 });
    }

    const userId = userResult.user.id;

    const { data: members, error } = await admin
      .from("organization_members")
      .select("tenant_id, role, is_active, tenants(id, slug, name, is_active)")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const tenants = (members || [])
      .filter((m: any) => m.tenants)
      .map((m: any) => ({
        id: m.tenants.id,
        slug: m.tenants.slug,
        name: m.tenants.name,
        role: m.role,
        isActive: m.is_active,
      }));

    return NextResponse.json({ success: true, tenants });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/tenants
 * Crea una nueva organización y vincula al usuario actual como 'owner'.
 */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: userResult, error: userError } = await admin.auth.getUser(token);
    if (userError || !userResult.user) {
      return NextResponse.json({ success: false, error: "Token inválido" }, { status: 401 });
    }

    const body = await request.json();
    const { name, slug } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "El nombre es obligatorio" }, { status: 400 });
    }

    // Generar slug si no se envía
    const generatedSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const finalSlug = generatedSlug || `org-${Date.now().toString(36)}`;

    // Crear tenant
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({
        name: name.trim(),
        slug: finalSlug,
        is_active: true,
      })
      .select()
      .single();

    if (tenantErr) {
      if (tenantErr.code === "23505") {
        return NextResponse.json(
          { success: false, error: "Ya existe una organización con ese identificador slug." },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: tenantErr.message }, { status: 500 });
    }

    // Vincular al usuario como 'owner'
    const { error: memberErr } = await admin
      .from("organization_members")
      .insert({
        tenant_id: tenant.id,
        user_id: userResult.user.id,
        role: "owner",
        is_active: true,
      });

    if (memberErr) {
      return NextResponse.json({ success: false, error: memberErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        role: "owner",
        isActive: true,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

