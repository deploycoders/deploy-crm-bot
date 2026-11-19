import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTenantContext, isTenantAdmin } from "@/lib/tenant";

// GET /api/catalog - Listar o buscar productos del catálogo del tenant
export async function GET(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("q")?.trim() || "";
    const category = searchParams.get("category")?.trim() || "";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("tenant_catalog")
      .select("*")
      .eq("tenant_id", tenant.tenantId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    if (search) {
      query = query.or(
        `sku.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%,category.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error interno" }, { status: 500 });
  }
}

// POST /api/catalog - Crear producto en el catálogo
export async function POST(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización" },
        { status: 401 }
      );
    }

    if (!isTenantAdmin(tenant)) {
      return NextResponse.json(
        { error: "Permiso denegado: solo administradores pueden modificar el catálogo" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      sku,
      name,
      description,
      category = "General",
      price = 0,
      compare_price,
      currency = "USD",
      stock_qty = 0,
      stock_status,
      image_url,
      specs = {},
      is_active = true,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio" },
        { status: 400 }
      );
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice < 0) {
      return NextResponse.json(
        { error: "El precio debe ser un número válido mayor o igual a cero" },
        { status: 400 }
      );
    }

    const qty = parseInt(stock_qty, 10) || 0;
    const computedStatus =
      stock_status || (qty <= 0 ? "out_of_stock" : qty <= 5 ? "low_stock" : "in_stock");

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tenant_catalog")
      .insert({
        tenant_id: tenant.tenantId,
        sku: sku ? sku.trim() : null,
        name: name.trim(),
        description: description?.trim() || null,
        category: category.trim() || "General",
        price: numericPrice,
        compare_price: compare_price ? parseFloat(compare_price) : null,
        currency: currency.trim() || "USD",
        stock_qty: qty,
        stock_status: computedStatus,
        image_url: image_url?.trim() || null,
        specs,
        is_active: Boolean(is_active),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `Ya existe un producto con el SKU "${sku}" en este negocio.` },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al crear producto" }, { status: 500 });
  }
}

// PUT /api/catalog - Actualizar producto
export async function PUT(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización" },
        { status: 401 }
      );
    }

    if (!isTenantAdmin(tenant)) {
      return NextResponse.json(
        { error: "Permiso denegado: solo administradores pueden modificar el catálogo" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Falta el ID del producto a actualizar" }, { status: 400 });
    }

    if (updates.price !== undefined) {
      updates.price = parseFloat(updates.price);
    }
    if (updates.compare_price !== undefined) {
      updates.compare_price = updates.compare_price ? parseFloat(updates.compare_price) : null;
    }
    if (updates.stock_qty !== undefined) {
      updates.stock_qty = parseInt(updates.stock_qty, 10) || 0;
      if (!updates.stock_status) {
        updates.stock_status =
          updates.stock_qty <= 0 ? "out_of_stock" : updates.stock_qty <= 5 ? "low_stock" : "in_stock";
      }
    }
    updates.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tenant_catalog")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenant.tenantId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, item: data });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al actualizar producto" }, { status: 500 });
  }
}

// DELETE /api/catalog - Eliminar producto
export async function DELETE(request: NextRequest) {
  try {
    const tenant = await getTenantContext(request);
    if (!tenant) {
      return NextResponse.json(
        { error: "No autorizado o sin membresía activa en la organización" },
        { status: 401 }
      );
    }

    if (!isTenantAdmin(tenant)) {
      return NextResponse.json(
        { error: "Permiso denegado: solo administradores pueden eliminar del catálogo" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta el ID del producto a eliminar" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("tenant_catalog")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenant.tenantId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Error al eliminar producto" }, { status: 500 });
  }
}
