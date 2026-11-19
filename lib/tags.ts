import { supabase } from "@/lib/supabase";

export interface CRMTag {
  id: string;
  name: string;
  color: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
}

export const CRM_TAGS: CRMTag[] = [
  {
    id: "vip",
    name: "VIP",
    color: "#F59E0B",
    bgClass: "bg-amber-400/15",
    borderClass: "border-amber-400/30",
    textClass: "text-amber-300",
  },
  {
    id: "hot",
    name: "Prospecto Caliente",
    color: "#EF4444",
    bgClass: "bg-rose-500/15",
    borderClass: "border-rose-500/30",
    textClass: "text-rose-300",
  },
  {
    id: "proposal",
    name: "En Propuesta",
    color: "#10B981",
    bgClass: "bg-emerald-500/15",
    borderClass: "border-emerald-500/30",
    textClass: "text-emerald-300",
  },
  {
    id: "support",
    name: "Soporte Técnico",
    color: "#0EA5E9",
    bgClass: "bg-sky-500/15",
    borderClass: "border-sky-500/30",
    textClass: "text-sky-300",
  },
  {
    id: "discarded",
    name: "Descartado",
    color: "#64748B",
    bgClass: "bg-slate-500/15",
    borderClass: "border-slate-500/30",
    textClass: "text-slate-400",
  },
];

const LOCAL_STORAGE_KEY = "crm_lead_tags";

export function getAllTagsMap(): Record<string, string[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getLeadTags(contactId: string): string[] {
  const map = getAllTagsMap();
  return map[contactId] || [];
}

/**
 * Alterna una etiqueta localmente y la sincroniza con la base de datos de Supabase.
 */
export function toggleLeadTag(contactId: string, tagId: string, tenantId?: string): string[] {
  const map = getAllTagsMap();
  const current = map[contactId] || [];
  const exists = current.includes(tagId);

  let updated: string[];
  if (exists) {
    updated = current.filter((id) => id !== tagId);
  } else {
    updated = [...current, tagId];
  }

  map[contactId] = updated;

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Error guardando tags en localStorage:", err);
  }

  // Sincronizar en segundo plano con la base de datos si tenemos tenantId
  if (tenantId) {
    if (exists) {
      supabase
        .from("contact_tags")
        .delete()
        .eq("tenant_id", tenantId)
        .eq("contact_id", contactId)
        .eq("tag", tagId)
        .then(({ error }) => {
          if (error) console.warn("Aviso al eliminar tag en BD:", error.message);
        });
    } else {
      supabase
        .from("contact_tags")
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          tag: tagId,
        })
        .then(({ error }) => {
          if (error) console.warn("Aviso al insertar tag en BD:", error.message);
        });
    }
  }

  return updated;
}

/**
 * Carga todos los tags de contactos desde la base de datos para sincronizar con la memoria.
 */
export async function loadTagsFromDB(tenantId: string): Promise<Record<string, string[]>> {
  if (!tenantId) return getAllTagsMap();

  try {
    const { data, error } = await supabase
      .from("contact_tags")
      .select("contact_id, tag")
      .eq("tenant_id", tenantId);

    if (error || !data) return getAllTagsMap();

    const dbMap: Record<string, string[]> = {};
    for (const row of data) {
      if (!dbMap[row.contact_id]) dbMap[row.contact_id] = [];
      dbMap[row.contact_id].push(row.tag);
    }

    if (typeof window !== "undefined") {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dbMap));
    }

    return dbMap;
  } catch (err) {
    console.warn("Error cargando tags de base de datos:", err);
    return getAllTagsMap();
  }
}
