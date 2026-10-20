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

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "agent";
  roleLabel: string;
  permissions: Permission[];
  avatar?: string;
  loggedAt: string;
}

export const SUPERADMIN_USER: AuthUser = {
  id: "usr_superadmin_master",
  name: "Jesús",
  email: "admin@salesbot.crm",
  role: "superadmin",
  roleLabel: "Super Administrador (Acceso Total)",
  permissions: ["*"],
  avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=SalesBotAdmin&backgroundColor=08111f",
  loggedAt: new Date().toISOString(),
};

export const AUTH_STORAGE_KEY = "crm_user_session";
export const AUTH_COOKIE_NAME = "crm_auth_token";

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

export function saveSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
  setCookie(AUTH_COOKIE_NAME, "authenticated_superadmin", 30);
}

export function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
  deleteCookie(AUTH_COOKIE_NAME);
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
