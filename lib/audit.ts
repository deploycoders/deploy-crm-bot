/**
 * lib/audit.ts
 * Audit Trail — registro centralizado de todas las acciones del asesor.
 *
 * Cada acción importante que realiza un asesor (responder, tomar control,
 * activar IA, asignar tag, asignar asesor, exportar, etc.) genera un
 * evento que se guarda tanto en localStorage (cache local) como se envía
 * al endpoint /api/audit para persistencia en Supabase.
 */

export type AuditAction =
  | "agent:message_sent"        // Asesor envió mensaje al cliente
  | "agent:takeover"            // Asesor tomó control de la IA
  | "agent:handover_to_ai"      // Asesor devolvió control a la IA
  | "agent:resolved"            // Asesor marcó conversación como resuelta
  | "agent:tag_added"           // Asesor añadió etiqueta CRM
  | "agent:tag_removed"         // Asesor eliminó etiqueta CRM
  | "agent:lead_assigned"       // Asesor asignó lead a otro asesor
  | "agent:note_saved"          // Asesor guardó nota privada
  | "agent:export_csv"          // Asesor exportó leads a CSV
  | "agent:pipeline_stage_changed" // Asesor cambió etapa del pipeline
  | "auth:login"                // Inicio de sesión
  | "auth:logout";              // Cierre de sesión

export interface AuditEvent {
  id: string;
  action: AuditAction;
  userId: string;
  userName: string;
  conversationId?: string;
  contactId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

const LOCAL_AUDIT_KEY = "crm_audit_trail";
const MAX_LOCAL_EVENTS = 200;

/** Genera un ID de evento único */
function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Guarda un evento en localStorage como cache local */
function saveToLocalCache(event: AuditEvent): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const events: AuditEvent[] = raw ? JSON.parse(raw) : [];
    events.unshift(event); // más reciente primero
    // Limitar tamaño del cache
    if (events.length > MAX_LOCAL_EVENTS) {
      events.splice(MAX_LOCAL_EVENTS);
    }
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(events));
  } catch {
    // Ignorar errores de storage
  }
}

/** Obtiene todos los eventos del cache local */
export function getLocalAuditLog(): AuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Limpia el audit trail local */
export function clearLocalAuditLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_AUDIT_KEY);
}

/**
 * Registra una acción en el audit trail.
 * - Guarda localmente de inmediato (no bloquea UI)
 * - Envía al servidor en background (fire-and-forget)
 */
export async function trackAction(
  action: AuditAction,
  userId: string,
  userName: string,
  options?: {
    conversationId?: string;
    contactId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const event: AuditEvent = {
    id: generateEventId(),
    action,
    userId,
    userName,
    conversationId: options?.conversationId,
    contactId: options?.contactId,
    metadata: options?.metadata,
    timestamp: new Date().toISOString(),
  };

  // 1. Cache local inmediato
  saveToLocalCache(event);

  // 2. Persistir en servidor (fire-and-forget, no bloquea UI)
  if (typeof window !== "undefined") {
    fetch("/api/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }).catch(() => {
      // Si falla el servidor, el evento ya quedó en localStorage
    });
  }
}

/**
 * Hook helper para crear funciones de audit pre-configuradas con el usuario actual.
 * Uso: const audit = createAuditor(user); audit("agent:message_sent", { conversationId });
 */
export function createAuditor(userId: string, userName: string) {
  return (
    action: AuditAction,
    options?: {
      conversationId?: string;
      contactId?: string;
      metadata?: Record<string, unknown>;
    }
  ) => trackAction(action, userId, userName, options);
}

/** Formatea una acción para mostrarla en UI */
export function formatAuditAction(action: AuditAction): string {
  const labels: Record<AuditAction, string> = {
    "agent:message_sent": "Mensaje enviado al cliente",
    "agent:takeover": "Tomó control manual",
    "agent:handover_to_ai": "Devolvió control a IA",
    "agent:resolved": "Marcó como resuelto",
    "agent:tag_added": "Etiqueta añadida",
    "agent:tag_removed": "Etiqueta eliminada",
    "agent:lead_assigned": "Lead reasignado",
    "agent:note_saved": "Nota guardada",
    "agent:export_csv": "Exportación CSV",
    "agent:pipeline_stage_changed": "Etapa del pipeline cambiada",
    "auth:login": "Inicio de sesión",
    "auth:logout": "Cierre de sesión",
  };
  return labels[action] ?? action;
}
