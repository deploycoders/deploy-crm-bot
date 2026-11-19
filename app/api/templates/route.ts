import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant";

// GET /api/templates - Listar plantillas aprobadas de Meta para el tenant
export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ templates: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

// POST /api/templates - Registrar o sincronizar plantilla Meta aprobada
export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (!isTenantAdmin(tenant)) {
      return NextResponse.json(
        { error: "Solo administradores pueden registrar plantillas" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      template_name,
      language = "es",
      category = "UTILITY",
      header_text,
      body_text,
      footer_text,
      buttons = [],
      meta_template_id,
      status = "approved",
    } = body;

    if (!template_name?.trim() || !body_text?.trim()) {
      return NextResponse.json(
        { error: "El nombre de la plantilla y el texto del cuerpo son obligatorios" },
        { status: 400 }
      );
    }

    const cleanName = template_name.trim().toLowerCase().replace(/\s+/g, "_");

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .upsert(
        {
          tenant_id: tenant.tenantId,
          template_name: cleanName,
          language: language.trim().toLowerCase(),
          category,
          header_text: header_text?.trim() || null,
          body_text: body_text.trim(),
          footer_text: footer_text?.trim() || null,
          buttons,
          meta_template_id: meta_template_id?.trim() || null,
          status,
        },
        { onConflict: "tenant_id,template_name,language" }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, template: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al registrar plantilla" }, { status: 500 });
  }
}

// DELETE /api/templates - Eliminar plantilla
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta ID de plantilla" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("whatsapp_templates")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenant.tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al eliminar plantilla" }, { status: 500 });
  }
}
