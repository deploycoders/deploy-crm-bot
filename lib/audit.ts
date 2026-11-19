/**
 * lib/audit.ts
 * Audit Trail — registro centralizado de acciones del asesor por Tenant.
 */

import { tenantRequestHeaders } from "@/lib/tenantClient";

export type AuditAction =
  | "agent:message_sent"
  | "agent:takeover"
  | "agent:handover_to_ai"
  | "agent:resolved"
  | "agent:tag_added"
  | "agent:tag_removed"
  | "agent:lead_assigned"
  | "agent:note_saved"
  | "agent:export_csv"
  | "agent:pipeline_stage_changed"
  | "auth:login"
  | "auth:logout";

export interface AuditEvent {
  id: string;
  action: AuditAction;
  userId: string;
  userName: string;
  conversationId?: string;
  contactId?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  tenantId?: string;
}

const LOCAL_AUDIT_KEY = "crm_audit_trail";
const MAX_LOCAL_EVENTS = 200;

function generateEventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function saveToLocalCache(event: AuditEvent): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    const events: AuditEvent[] = raw ? JSON.parse(raw) : [];
    events.unshift(event);
    if (events.length > MAX_LOCAL_EVENTS) {
      events.splice(MAX_LOCAL_EVENTS);
    }
    localStorage.setItem(LOCAL_AUDIT_KEY, JSON.stringify(events));
  } catch {
    // ignore
  }
}

export function getLocalAuditLog(): AuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_AUDIT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearLocalAuditLog(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_AUDIT_KEY);
}

/**
 * Registra una acción en el audit trail del tenant activo.
 */
export async function trackAction(
  action: AuditAction,
  userId: string,
  userName: string,
  options?: {
    conversationId?: string;
    contactId?: string;
    metadata?: Record<string, unknown>;
    tenantId?: string;
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
    tenantId: options?.tenantId,
    timestamp: new Date().toISOString(),
  };

  saveToLocalCache(event);

  if (typeof window !== "undefined") {
    try {
      const headers = await tenantRequestHeaders(options?.tenantId);
      fetch("/api/audit", {
        method: "POST",
        headers,
        body: JSON.stringify(event),
      }).catch(() => {
        // Silencioso
      });
    } catch {
      // Ignorar fallos de red en audit secundario
    }
  }
}

export function createAuditor(userId: string, userName: string, tenantId?: string) {
  return (
    action: AuditAction,
    options?: {
      conversationId?: string;
      contactId?: string;
      metadata?: Record<string, unknown>;
      tenantId?: string;
    }
  ) => trackAction(action, userId, userName, { ...options, tenantId: options?.tenantId || tenantId });
}

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
