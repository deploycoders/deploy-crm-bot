import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant";

export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }
    if (!isTenantAdmin(tenant)) {
      return NextResponse.json({ success: false, error: "Permisos insuficientes" }, { status: 403 });
    }

    const body = await request.json();
    const { email, role = "agent", name, temporaryPassword } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "Correo electrónico inválido" }, { status: 400 });
    }

    const cleanEmail = email.toLowerCase().trim();
    const allowedRoles = ["owner", "admin", "agent"];
    const memberRole = allowedRoles.includes(role) ? role : "agent";

    const admin = getSupabaseAdmin();

    // 1. Buscar si el usuario ya existe en Supabase Auth
    const { data: listData } = await admin.auth.admin.listUsers();
    let targetUser = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

    // 2. Si no existe, crearlo con contraseña temporal proporcionada o autogenerada
    if (!targetUser) {
      const initialPassword = temporaryPassword?.trim() || `Crm${Math.random().toString(36).slice(2, 8)}!2026`;
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: initialPassword,
        email_confirm: true,
        user_metadata: {
          name: name || cleanEmail.split("@")[0],
          role: memberRole,
        },
      });

      if (createErr || !newUser.user) {
        return NextResponse.json(
          { success: false, error: `Error creando usuario: ${createErr?.message || "Desconocido"}` },
          { status: 500 }
        );
      }
      targetUser = newUser.user;
    }

    // 3. Verificar si ya es miembro de este tenant
    const { data: existingMember } = await admin
      .from("organization_members")
      .select("tenant_id, role")
      .eq("tenant_id", tenant.tenantId)
      .eq("user_id", targetUser.id)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: "Este usuario ya pertenece a esta organización." },
        { status: 409 }
      );
    }

    // 4. Agregar a organization_members
    const { error: insertErr } = await admin.from("organization_members").insert({
      tenant_id: tenant.tenantId,
      user_id: targetUser.id,
      role: memberRole,
      is_active: true,
    });

    if (insertErr) {
      return NextResponse.json({ success: false, error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Usuario ${cleanEmail} añadido exitosamente al equipo.`,
      member: {
        userId: targetUser.id,
        email: cleanEmail,
        role: memberRole,
        name: name || cleanEmail.split("@")[0],
      },
    });
  } catch (error: any) {
    console.error("[team:invite:POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

