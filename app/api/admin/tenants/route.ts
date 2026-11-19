import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

async function verifySuperAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;

  const admin = getSupabaseAdmin();
  const { data: userResult, error: userError } = await admin.auth.getUser(token);
  if (userError || !userResult.user) return null;

  const user = userResult.user;
  const isSuper =
    user.user_metadata?.role === "superadmin" ||
    user.email?.toLowerCase() === "admin@salesbot.crm" ||
    (user.user_metadata?.permissions as string[])?.includes("*");

  if (!isSuper) return null;
  return user;
}

/**
 * GET /api/admin/tenants
 * Lista todos los tenants de la plataforma con métricas, canales y dueños.
 */
export async function GET(request: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(request);
    if (!superAdmin) {
      return NextResponse.json(
        { success: false, error: "Acceso denegado: Requiere permisos de Super Administrador" },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdmin();

    // 1. Obtener todos los tenants
    const { data: tenants, error: tenantsErr } = await admin
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });

    if (tenantsErr) {
      return NextResponse.json({ success: false, error: tenantsErr.message }, { status: 500 });
    }

    // 2. Obtener lista de usuarios de Auth para enriquecer los owners
    const { data: authUsersData } = await admin.auth.admin.listUsers();
    const authUsersMap = new Map((authUsersData?.users || []).map((u) => [u.id, u]));

    // 3. Enriquecer cada tenant con métricas, canal y owner
    const enrichedTenants = await Promise.all(
      (tenants || []).map(async (t) => {
        // Conteo de miembros
        const { count: memberCount } = await admin
          .from("organization_members")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", t.id);

        // Conteo de conversaciones
        const { count: convCount } = await admin
          .from("conversations")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", t.id);

        // Canal de WhatsApp
        const { data: channel } = await admin
          .from("tenant_channels")
          .select("id, external_id, display_name, is_active, access_token")
          .eq("tenant_id", t.id)
          .eq("provider", "whatsapp")
          .maybeSingle();

        // Propietario / Owner
        const { data: ownerMember } = await admin
          .from("organization_members")
          .select("user_id, role")
          .eq("tenant_id", t.id)
          .eq("role", "owner")
          .limit(1)
          .maybeSingle();

        const ownerUser = ownerMember ? authUsersMap.get(ownerMember.user_id) : null;
        const ownerMeta = ownerUser?.user_metadata || {};

        return {
          id: t.id,
          slug: t.slug,
          name: t.name,
          isActive: t.is_active,
          createdAt: t.created_at,
          memberCount: memberCount || 0,
          conversationCount: convCount || 0,
          owner: {
            userId: ownerMember?.user_id || null,
            email: ownerUser?.email || "Sin asignar",
            name: ownerMeta.name || (ownerUser?.email ? ownerUser.email.split("@")[0] : "Desconocido"),
          },
          whatsapp: channel
            ? {
                id: channel.id,
                phoneNumberId: channel.external_id,
                displayName: channel.display_name,
                isActive: channel.is_active,
                hasCustomToken: Boolean(channel.access_token),
              }
            : null,
        };
      })
    );

    return NextResponse.json({ success: true, tenants: enrichedTenants });
  } catch (error: any) {
    console.error("[admin:tenants:GET] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

/**
 * POST /api/admin/tenants
 * Registra una nueva empresa/tenant, crea a su dueño y vincula su canal.
 */
export async function POST(request: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(request);
    if (!superAdmin) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      slug,
      ownerEmail,
      ownerName,
      initialPassword,
      whatsappPhoneNumberId,
      whatsappAccessToken,
      whatsappDisplayName = "WhatsApp Principal",
    } = body;

    if (!name || typeof name !== "string") {
      return NextResponse.json({ success: false, error: "El nombre de la empresa es obligatorio" }, { status: 400 });
    }

    const cleanSlug = (slug || name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    const admin = getSupabaseAdmin();

    // 1. Crear Tenant
    const { data: tenant, error: tenantErr } = await admin
      .from("tenants")
      .insert({
        name: name.trim(),
        slug: cleanSlug,
        is_active: true,
      })
      .select()
      .single();

    if (tenantErr) {
      if (tenantErr.code === "23505") {
        return NextResponse.json(
          { success: false, error: `El slug '${cleanSlug}' ya pertenece a otra organización.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: tenantErr.message }, { status: 500 });
    }

    // 2. Si se suministra email de propietario, crear o vincular usuario
    let ownerUserId: string | null = null;
    if (ownerEmail && ownerEmail.includes("@")) {
      const cleanEmail = ownerEmail.toLowerCase().trim();
      const { data: listData } = await admin.auth.admin.listUsers();
      let targetUser = listData?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

      if (!targetUser) {
        const pass = initialPassword?.trim() || `Client${Math.random().toString(36).slice(2, 8)}!2026`;
        const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
          email: cleanEmail,
          password: pass,
          email_confirm: true,
          user_metadata: {
            name: ownerName || cleanEmail.split("@")[0],
            role: "admin",
          },
        });
        if (!createErr && newUser.user) {
          targetUser = newUser.user;
        }
      }

      if (targetUser) {
        ownerUserId = targetUser.id;
        await admin.from("organization_members").insert({
          tenant_id: tenant.id,
          user_id: targetUser.id,
          role: "owner",
          is_active: true,
        });
      }
    }

    // Vincular también al SuperAdmin como soporte técnico del nuevo tenant
    if (superAdmin.id !== ownerUserId) {
      await admin.from("organization_members").insert({
        tenant_id: tenant.id,
        user_id: superAdmin.id,
        role: "owner",
        is_active: true,
      });
    }

    // 3. Si se suministra Phone Number ID de WhatsApp, registrar canal
    if (whatsappPhoneNumberId && whatsappPhoneNumberId.trim()) {
      await admin.from("tenant_channels").insert({
        tenant_id: tenant.id,
        provider: "whatsapp",
        external_id: whatsappPhoneNumberId.trim(),
        display_name: whatsappDisplayName.trim(),
        access_token: whatsappAccessToken?.trim() || null,
        is_active: true,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Tenant '${tenant.name}' creado con éxito.`,
      tenant,
    });
  } catch (error: any) {
    console.error("[admin:tenants:POST] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/tenants
 * Suspende o reactiva un tenant, o actualiza su nombre.
 */
export async function PATCH(request: NextRequest) {
  try {
    const superAdmin = await verifySuperAdmin(request);
    if (!superAdmin) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 403 });
    }

    const body = await request.json();
    const { tenantId, isActive, name } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "tenantId es obligatorio" }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (typeof isActive === "boolean") updates.is_active = isActive;
    if (name && typeof name === "string") updates.name = name.trim();

    const { data: updated, error } = await admin
      .from("tenants")
      .update(updates)
      .eq("id", tenantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tenant: updated });
  } catch (error: any) {
    console.error("[admin:tenants:PATCH] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Error interno" }, { status: 500 });
  }
}

