export type Permission =
  | "*"
  | "crm:read"
  | "crm:write"
  | "chat:manage"
  | "chat:takeover"
  | "contacts:manage"
  | "contacts:export"
  | "ai:manage"
  | "whatsapp:manage"
  | "settings:manage"
  | "database:admin";

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  role: "owner" | "admin" | "agent";
  isActive: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "agent";
  roleLabel: string;
  permissions: Permission[];
  avatar?: string;
  loggedAt: string;
  tenantId?: string;
  tenantName?: string;
  tenants?: TenantInfo[];
  activeTenant?: TenantInfo | null;
}

export const AUTH_STORAGE_KEY = "crm_user_session";
export const AUTH_COOKIE_NAME = "crm_auth_token";
export const ACTIVE_TENANT_COOKIE_NAME = "crm_active_tenant_id";
export const ACTIVE_TENANT_STORAGE_KEY = "crm_active_tenant_id";

export function setCookie(name: string, value: string, days: number = 30) {
  if (typeof document === "undefined") return;
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

export function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const matches = document.cookie.match(
    new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)")
  );
  return matches ? decodeURIComponent(matches[1]) : null;
}

export function saveSession(user: AuthUser, token?: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  setCookie(AUTH_COOKIE_NAME, token || user.id, 30);
  if (user.activeTenant?.id) {
    localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, user.activeTenant.id);
    setCookie(ACTIVE_TENANT_COOKIE_NAME, user.activeTenant.id, 30);
  }
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(ACTIVE_TENANT_STORAGE_KEY);
  deleteCookie(AUTH_COOKIE_NAME);
  deleteCookie(ACTIVE_TENANT_COOKIE_NAME);
}

export function loadSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function hasPermission(user: AuthUser | null, permission: Permission): boolean {
  if (!user) return false;
  if (user.permissions.includes("*")) return true;
  return user.permissions.includes(permission);
}
