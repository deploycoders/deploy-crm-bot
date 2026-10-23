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

/** Equipo de asesores iniciales por defecto */
export const DEFAULT_CRM_AGENTS: CRMAgent[] = [
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

export const CRM_AGENTS = DEFAULT_CRM_AGENTS;

const AGENTS_STORAGE_KEY = "crm_team_agents";
const LOCAL_STORAGE_KEY = "crm_lead_assignments";

const COLOR_PALETTES = [
  { color: "#4EDEA3", bgClass: "bg-emerald-500/15", textClass: "text-emerald-300", borderClass: "border-emerald-500/30" },
  { color: "#818CF8", bgClass: "bg-indigo-500/15", textClass: "text-indigo-300", borderClass: "border-indigo-500/30" },
  { color: "#F59E0B", bgClass: "bg-amber-500/15", textClass: "text-amber-300", borderClass: "border-amber-500/30" },
  { color: "#EC4899", bgClass: "bg-pink-500/15", textClass: "text-pink-300", borderClass: "border-pink-500/30" },
  { color: "#38BDF8", bgClass: "bg-sky-500/15", textClass: "text-sky-300", borderClass: "border-sky-500/30" },
  { color: "#A855F7", bgClass: "bg-purple-500/15", textClass: "text-purple-300", borderClass: "border-purple-500/30" },
  { color: "#F97316", bgClass: "bg-orange-500/15", textClass: "text-orange-300", borderClass: "border-orange-500/30" },
  { color: "#14B8A6", bgClass: "bg-teal-500/15", textClass: "text-teal-300", borderClass: "border-teal-500/30" },
];

/** Obtiene la lista dinámica de asesores */
export function getAllAgents(): CRMAgent[] {
  if (typeof window === "undefined") return DEFAULT_CRM_AGENTS;
  try {
    const raw = localStorage.getItem(AGENTS_STORAGE_KEY);
    if (!raw) return DEFAULT_CRM_AGENTS;
    const parsed: CRMAgent[] = JSON.parse(raw);
    if (!parsed.some((a) => a.id === "unassigned")) {
      return [DEFAULT_CRM_AGENTS[0], ...parsed];
    }
    return parsed;
  } catch {
    return DEFAULT_CRM_AGENTS;
  }
}

/** Genera iniciales a partir del nombre */
export function generateInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Agrega o edita un asesor */
export function saveAgent(agent: { id?: string; name: string; role: string }): CRMAgent {
  const agents = getAllAgents();
  const initials = generateInitials(agent.name);

  if (agent.id && agent.id !== "unassigned") {
    // Editar
    const index = agents.findIndex((a) => a.id === agent.id);
    if (index !== -1) {
      agents[index] = {
        ...agents[index],
        name: agent.name.trim(),
        role: agent.role.trim() || "Asesor",
        avatar: initials,
      };
      if (typeof window !== "undefined") {
        localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));
        window.dispatchEvent(new CustomEvent("crm:agents-updated"));
      }
      return agents[index];
    }
  }

  // Crear nuevo
  const palette = COLOR_PALETTES[agents.length % COLOR_PALETTES.length];
  const newAgent: CRMAgent = {
    id: `agent_${Date.now()}`,
    name: agent.name.trim(),
    role: agent.role.trim() || "Asesor",
    avatar: initials,
    ...palette,
  };

  const updated = [...agents, newAgent];
  if (typeof window !== "undefined") {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("crm:agents-updated"));
  }
  return newAgent;
}

/** Elimina un asesor (reasingando sus leads a "unassigned") */
export function deleteAgent(agentId: string): void {
  if (agentId === "unassigned") return;
  const agents = getAllAgents().filter((a) => a.id !== agentId);
  if (typeof window !== "undefined") {
    localStorage.setItem(AGENTS_STORAGE_KEY, JSON.stringify(agents));

    // Reasignar los leads asignados a este asesor
    const assignments = getAllAssignmentsMap();
    let changed = false;
    for (const contactId in assignments) {
      if (assignments[contactId] === agentId) {
        delete assignments[contactId];
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(assignments));
      window.dispatchEvent(new CustomEvent("crm:assignment-change"));
    }

    window.dispatchEvent(new CustomEvent("crm:agents-updated"));
  }
}

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
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("crm:assignment-change", {
          detail: { contactId, agentId },
        })
      );
    }
  } catch (err) {
    console.error("Error guardando asignación de asesor:", err);
  }
}

/** Devuelve el objeto CRMAgent por su id (fallback: "unassigned") */
export function getAgentById(agentId: string): CRMAgent {
  const agents = getAllAgents();
  return agents.find((a) => a.id === agentId) ?? agents[0] ?? DEFAULT_CRM_AGENTS[0];
}
