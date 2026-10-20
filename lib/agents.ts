/**
 * lib/agents.ts
 * Gestión del equipo de asesores y asignación de leads.
 * Las asignaciones se persisten en localStorage por sesión de navegador.
 */

export interface CRMAgent {
  id: string;
  name: string;
  role: string;
  avatar: string; // Iniciales o URL
  color: string;  // Color HEX para el badge
  bgClass: string;
  textClass: string;
  borderClass: string;
}

/** Equipo de asesores disponibles. Se puede ampliar para leer de Supabase. */
export const CRM_AGENTS: CRMAgent[] = [
  {
    id: "unassigned",
    name: "Sin asignar",
    role: "—",
    avatar: "?",
    color: "#64748B",
    bgClass: "bg-slate-500/15",
    textClass: "text-slate-400",
    borderClass: "border-slate-500/30",
  },
  {
    id: "agent_jesus",
    name: "Jesús P.",
    role: "Senior Sales",
    avatar: "JP",
    color: "#4EDEA3",
    bgClass: "bg-emerald-500/15",
    textClass: "text-emerald-300",
    borderClass: "border-emerald-500/30",
  },
  {
    id: "agent_maria",
    name: "María L.",
    role: "Account Exec",
    avatar: "ML",
    color: "#818CF8",
    bgClass: "bg-indigo-500/15",
    textClass: "text-indigo-300",
    borderClass: "border-indigo-500/30",
  },
  {
    id: "agent_carlos",
    name: "Carlos R.",
    role: "SDR",
    avatar: "CR",
    color: "#F59E0B",
    bgClass: "bg-amber-500/15",
    textClass: "text-amber-300",
    borderClass: "border-amber-500/30",
  },
  {
    id: "agent_ana",
    name: "Ana G.",
    role: "Customer Success",
    avatar: "AG",
    color: "#EC4899",
    bgClass: "bg-pink-500/15",
    textClass: "text-pink-300",
    borderClass: "border-pink-500/30",
  },
];

const LOCAL_STORAGE_KEY = "crm_lead_assignments";

/** Devuelve el mapa completo { contactId -> agentId } */
export function getAllAssignmentsMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Obtiene el agentId asignado a un contacto (o "unassigned") */
export function getLeadAgent(contactId: string): string {
  const map = getAllAssignmentsMap();
  return map[contactId] || "unassigned";
}

/** Asigna un agente a un lead y persiste el cambio */
export function assignLeadAgent(contactId: string, agentId: string): void {
  const map = getAllAssignmentsMap();
  if (agentId === "unassigned") {
    delete map[contactId];
  } else {
    map[contactId] = agentId;
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Error guardando asignación de asesor:", err);
  }
}

/** Devuelve el objeto CRMAgent por su id (fallback: "unassigned") */
export function getAgentById(agentId: string): CRMAgent {
  return CRM_AGENTS.find((a) => a.id === agentId) ?? CRM_AGENTS[0];
}
