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

export function toggleLeadTag(contactId: string, tagId: string): string[] {
  const map = getAllTagsMap();
  const current = map[contactId] || [];
  let updated: string[];

  if (current.includes(tagId)) {
    updated = current.filter((id) => id !== tagId);
  } else {
    updated = [...current, tagId];
  }

  map[contactId] = updated;

  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Error guardando tags:", err);
  }

  return updated;
}
