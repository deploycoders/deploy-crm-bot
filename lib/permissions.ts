/**
 * lib/permissions.ts
 * Sistema de permisos y guards de acceso por rol para el CRM.
 *
 * Extiende lib/auth.ts añadiendo:
 *  - Reglas detalladas por acción
 *  - Hook usePermission para componentes React
 *  - Componentes guard de permisos
 *  - Rate limiting por usuario (simple, client-side)
 */

"use client";

import { useAuth } from "@/context/AuthContext";
import type { AuthUser, Permission } from "@/lib/auth";

// ──────────────────────────────────────────────────────────────────────────────
// 1. Mapa de permisos por acción de UI
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Acciones atómicas del CRM y qué permisos las protegen.
 * Se usa en el cliente para mostrar/ocultar elementos de UI.
 */
export const ACTION_PERMISSIONS: Record<string, Permission[]> = {
  // Chat
  "chat.send_message": ["chat:manage"],
  "chat.takeover": ["chat:takeover"],
  "chat.activate_ai": ["chat:manage"],
  "chat.resolve": ["chat:manage"],
  "chat.view": ["crm:read"],

  // Contactos
  "contacts.view": ["crm:read"],
  "contacts.edit": ["contacts:manage"],
  "contacts.export": ["contacts:export"],
  "contacts.delete": ["database:admin"],

  // Pipeline / Tags
  "pipeline.view": ["crm:read"],
  "pipeline.edit_stage": ["crm:write"],
  "tags.assign": ["crm:write"],

  // Equipo / Agentes
  "team.view": ["crm:read"],
  "team.assign_lead": ["crm:write"],

  // Configuración
  "settings.bot_config": ["settings:manage"],
  "settings.ai_manage": ["ai:manage"],
  "settings.whatsapp": ["whatsapp:manage"],

  // Admin
  "admin.audit_log": ["database:admin"],
  "admin.export_all": ["contacts:export"],
};

// ──────────────────────────────────────────────────────────────────────────────
// 2. Comprobación de acceso pura (no depende de React)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * ¿El usuario puede realizar esta acción?
 * Basta con que tenga UNO de los permisos requeridos (OR semántico).
 * Si el usuario tiene "*" (superadmin), siempre puede.
 */
export function canDo(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.permissions.includes("*")) return true;

  const required = ACTION_PERMISSIONS[action];
  if (!required || required.length === 0) return true; // acción pública

  return required.some((p) => user.permissions.includes(p));
}

/**
 * Devuelve true si el usuario tiene TODOS los permisos requeridos (AND semántico).
 */
export function canDoAll(user: AuthUser | null, action: string): boolean {
  if (!user) return false;
  if (user.permissions.includes("*")) return true;

  const required = ACTION_PERMISSIONS[action];
  if (!required || required.length === 0) return true;

  return required.every((p) => user.permissions.includes(p));
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Hook React — usePermission
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Hook que devuelve si el usuario actual puede realizar una acción.
 *
 * @example
 *   const { allowed } = usePermission("chat.send_message");
 *   if (!allowed) return null;
 */
export function usePermission(action: string): {
  allowed: boolean;
  user: AuthUser | null;
} {
  const { user } = useAuth();
  return {
    allowed: canDo(user, action),
    user,
  };
}

/**
 * Hook que devuelve un helper `can(action)` para verificar múltiples permisos.
 *
 * @example
 *   const { can } = usePermissions();
 *   can("chat.takeover") && <button>Tomar Control</button>
 */
export function usePermissions(): {
  can: (action: string) => boolean;
  canAll: (action: string) => boolean;
  user: AuthUser | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
} {
  const { user } = useAuth();
  return {
    can: (action: string) => canDo(user, action),
    canAll: (action: string) => canDoAll(user, action),
    user,
    isAdmin: user?.role === "admin" || user?.role === "superadmin",
    isSuperAdmin: user?.role === "superadmin",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Rate Limiting cliente (simple, anti-doble-click)
// ──────────────────────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, number>();

/**
 * Anti-doble-click / rate limiting simple por clave.
 * Devuelve true si la acción está permitida, false si está en cooldown.
 *
 * @param key      Identificador único (e.g. "send_msg_conv123")
 * @param cooldownMs Tiempo mínimo entre acciones (default 1500ms)
 */
export function rateLimit(key: string, cooldownMs = 1500): boolean {
  const last = rateLimitMap.get(key);
  const now = Date.now();

  if (last && now - last < cooldownMs) {
    return false; // en cooldown
  }

  rateLimitMap.set(key, now);
  return true;
}

/**
 * Limpia la entrada de rate limit para una clave.
 * Útil después de que la acción completa con error para permitir retry inmediato.
 */
export function resetRateLimit(key: string): void {
  rateLimitMap.delete(key);
}
