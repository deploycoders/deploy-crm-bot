import { getSupabaseAdmin } from "@/lib/supabase";

export interface CatalogItem {
  id: string;
  tenant_id: string;
  sku?: string | null;
  name: string;
  description?: string | null;
  category: string;
  price: number;
  compare_price?: number | null;
  currency: string;
  stock_qty: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  image_url?: string | null;
  specs?: Record<string, any>;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

/**
 * Busca productos y servicios en el catálogo real del tenant.
 * Prioriza concordancia por SKU, nombre y descripción.
 */
export async function searchCatalog(
  tenantId: string,
  query: string,
  limit: number = 6
): Promise<CatalogItem[]> {
  if (!tenantId) return [];

  const admin = getSupabaseAdmin();
  const cleanQuery = query.trim().toLowerCase();

  try {
    let supabaseQuery = admin
      .from("tenant_catalog")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

    if (cleanQuery) {
      // Filtrar por SKU exacto o coincidencia ilike en nombre/categoría/descripción
      supabaseQuery = supabaseQuery.or(
        `sku.ilike.%${cleanQuery}%,name.ilike.%${cleanQuery}%,category.ilike.%${cleanQuery}%,description.ilike.%${cleanQuery}%`
      );
    }

    const { data, error } = await supabaseQuery
      .order("stock_status", { ascending: true }) // 'in_stock' primero
      .order("name", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[Catalog] Error buscando productos:", error);
      return [];
    }

    return (data as CatalogItem[]) || [];
  } catch (err) {
    console.error("[Catalog] Excepción al buscar catálogo:", err);
    return [];
  }
}

/**
 * Obtiene todos los productos activos de un tenant (para catálogo general o fallback).
 */
export async function getAllActiveCatalog(
  tenantId: string,
  limit: number = 20
): Promise<CatalogItem[]> {
  if (!tenantId) return [];
  const admin = getSupabaseAdmin();

  try {
    const { data, error } = await admin
      .from("tenant_catalog")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("name", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[Catalog] Error cargando catálogo completo:", error);
      return [];
    }

    return (data as CatalogItem[]) || [];
  } catch (err) {
    console.error("[Catalog] Excepción:", err);
    return [];
  }
}

/**
 * Formatea una lista de productos para ser inyectada en el System Prompt de IA.
 * Provee la "Verdad Estricta del Catálogo" para evitar alucinaciones.
 */
export function formatCatalogForPrompt(items: CatalogItem[]): string {
  if (!items || items.length === 0) {
    return "CATÁLOGO DISPONIBLE: No se encontraron productos específicos coincidentes en la base de datos para esta consulta.";
  }

  const lines = items.map((item, idx) => {
    const stockDesc =
      item.stock_status === "out_of_stock" || item.stock_qty <= 0
        ? "AGOTADO / SIN STOCK"
        : item.stock_status === "low_stock"
        ? `POCAS UNIDADES (${item.stock_qty} disp.)`
        : `EN STOCK (${item.stock_qty} disp.)`;

    const skuPart = item.sku ? `[SKU: ${item.sku}]` : "";
    const comparePart =
      item.compare_price && item.compare_price > item.price
        ? ` (Antes: ${item.currency} ${item.compare_price})`
        : "";

    return `${idx + 1}. ${skuPart} ${item.name} - ${item.currency} ${item.price.toFixed(2)}${comparePart} | Estado: ${stockDesc} | Categoría: ${item.category}${
      item.description ? ` | Descripción: ${item.description}` : ""
    }`;
  });

  return `=== BASE DE CONOCIMIENTO: PRODUCTOS Y PRECIOS REALES DEL NEGOCIO ===\n${lines.join(
    "\n"
  )}\n\nREGLA ESTRICTA ANTI-ALUCINACIÓN:
- Usa ÚNICAMENTE los productos, modelos, SKUs y precios listados arriba.
- Si el cliente pregunta por un artículo que NO figura en esta lista o figura como AGOTADO, infórmale con total transparencia y honestidad que actualmente no está disponible o que no se maneja, y ofrece alternativas de la lista si aplican.
- NUNCA inventes precios, descuentos, especificaciones no mencionadas ni existencias fantasmas.`;
}
