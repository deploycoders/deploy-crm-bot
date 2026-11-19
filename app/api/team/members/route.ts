import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    const admin = getSupabaseAdmin();
    const { data: members, error: membersErr } = await admin
      .from("organization_members")
      .select("tenant_id, user_id, role, is_active, created_at")
      .eq("tenant_id", tenant.tenantId)
      .order("created_at", { ascending: true });

    if (membersErr) {
      return NextResponse.json({ success: false, error: membersErr.message }, { status: 500 });
    }

    // Enrich with user metadata/email from auth.users
    const userIds = (members || []).map((m) => m.user_id);
    const enrichedMembers = await Promise.all(
      (members || []).map(async (m) => {
        try {
          const { data: userData } = await admin.auth.admin.getUserById(m.user_id);
          const u = userData?.user;
          const meta = u?.user_metadata || {};
          return {
            userId: m.user_id,
            tenantId: m.tenant_id,
            role: m.role,
            isActive: m.is_active,
            createdAt: m.created_at,
            email: u?.email || "Sin correo",
            name: meta.name || (u?.email ? u.email.split("@")[0] : "Miembro"),
            avatar: meta.avatar,
          };
        } catch {
          return {
            userId: m.user_id,
            tenantId: m.tenant_id,
            role: m.role,
            isActive: m.is_active,
            createdAt: m.created_at,
            email: "Usuario",
            name: "Miembro",
          };
        }
      })
    );

    return NextResponse.json({ success: true, members: enrichedMembers });
  } catch (error: any) {
    console.error("[team:members:GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!isTenantAdmin(tenant)) {
      return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, role, isActive } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: "userId es obligatorio" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const updates: Record<string, any> = {};
    if (role && ["owner", "admin", "agent"].includes(role)) updates.role = role;
    if (typeof isActive === "boolean") updates.is_active = isActive;

    const { data, error } = await admin
      .from("organization_members")
      .update(updates)
      .eq("tenant_id", tenant.tenantId)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, member: data });
  } catch (error: any) {
    console.error("[team:members:PATCH] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!isTenantAdmin(tenant)) {
      return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ success: false, error: "userId es requerido" }, { status: 400 });
    }

    if (targetUserId === tenant.userId) {
      return NextResponse.json(
        { success: false, error: "No puedes expulsarte a ti mismo de la organización." },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from("organization_members")
      .delete()
      .eq("tenant_id", tenant.tenantId)
      .eq("user_id", targetUserId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Miembro eliminado de la organización." });
  } catch (error: any) {
    console.error("[team:members:DELETE] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

