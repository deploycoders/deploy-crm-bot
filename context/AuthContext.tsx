"use client";

import React, { createContext, useContext, useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  AuthUser,
  Permission,
  TenantInfo,
  clearSession,
  getCookie,
  hasPermission,
  loadSession,
  saveSession,
  setCookie,
  ACTIVE_TENANT_COOKIE_NAME,
  ACTIVE_TENANT_STORAGE_KEY,
} from "@/lib/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  tenants: TenantInfo[];
  activeTenant: TenantInfo | null;
  setActiveTenant: (tenant: TenantInfo) => void;
  refreshTenants: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUserToAuthUser(
  sbUser: any,
  activeTenant?: TenantInfo | null,
  tenants?: TenantInfo[]
): AuthUser {
  const metadata = sbUser.user_metadata || {};
  const isOwnerOrAdmin = activeTenant?.role === "owner" || activeTenant?.role === "admin";
  const role = metadata.role || (isOwnerOrAdmin ? "admin" : "agent");

  return {
    id: sbUser.id,
    email: sbUser.email || "",
    name: metadata.name || (sbUser.email ? sbUser.email.split("@")[0] : "Usuario"),
    role: role,
    roleLabel:
      activeTenant?.role === "owner"
        ? "Propietario de Organización"
        : activeTenant?.role === "admin"
        ? "Administrador de Tenant"
        : "Asesor CRM",
    permissions: (metadata.permissions as Permission[]) || ["*"],
    avatar:
      metadata.avatar ||
      `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        sbUser.email || "salesbot"
      )}&backgroundColor=08111f`,
    loggedAt: new Date().toISOString(),
    tenantId: activeTenant?.id,
    tenantName: activeTenant?.name,
    tenants: tenants || [],
    activeTenant: activeTenant || null,
  };
}

async function fetchUserTenants(userId: string): Promise<TenantInfo[]> {
  try {
    const { data, error } = await supabase
      .from("organization_members")
      .select("tenant_id, role, is_active, tenants(id, slug, name, is_active)")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (error || !data) return [];

    return (data || [])
      .filter((m: any) => m.tenants && m.tenants.is_active !== false)
      .map((m: any) => ({
        id: m.tenants.id,
        slug: m.tenants.slug,
        name: m.tenants.name,
        role: m.role as TenantInfo["role"],
        isActive: m.is_active,
      }));
  } catch (err) {
    console.warn("Error cargando tenants del usuario:", err);
    return [];
  }
}

/**
 * Si el usuario es el administrador y no tiene ninguna membresía, vincularlo al tenant 'legacy'.
 */
async function ensureDefaultMembership(userId: string): Promise<TenantInfo[]> {
  try {
    const { data: legacyTenant } = await supabase
      .from("tenants")
      .select("id, slug, name, is_active")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (legacyTenant) {
      // Intentar auto-asignar membresía
      await supabase.from("organization_members").insert({
        tenant_id: legacyTenant.id,
        user_id: userId,
        role: "owner",
        is_active: true,
      });

      return [
        {
          id: legacyTenant.id,
          slug: legacyTenant.slug,
          name: legacyTenant.name,
          role: "owner",
          isActive: true,
        },
      ];
    }
  } catch {
    // Continuar si falla
  }
  return [];
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenant, setActiveTenantState] = useState<TenantInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const [, startTransition] = useTransition();

  const syncTenantsForUser = useCallback(async (sbUser: any) => {
    let list = await fetchUserTenants(sbUser.id);
    if (list.length === 0) {
      list = await ensureDefaultMembership(sbUser.id);
    }

    const savedTenantId =
      getCookie(ACTIVE_TENANT_COOKIE_NAME) ||
      (typeof window !== "undefined" ? localStorage.getItem(ACTIVE_TENANT_STORAGE_KEY) : null);

    let active = list.find((t) => t.id === savedTenantId) || list[0] || null;

    if (active) {
      setCookie(ACTIVE_TENANT_COOKIE_NAME, active.id, 30);
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, active.id);
      }
    }

    const authUser = mapSupabaseUserToAuthUser(sbUser, active, list);
    setUser(authUser);
    setTenants(list);
    setActiveTenantState(active);
    return { authUser, active, list };
  }, []);

  const refreshTenants = useCallback(async () => {
    if (!user?.id) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await syncTenantsForUser(session.user);
    }
  }, [user?.id, syncTenantsForUser]);

  const setActiveTenant = (tenant: TenantInfo) => {
    setActiveTenantState(tenant);
    setCookie(ACTIVE_TENANT_COOKIE_NAME, tenant.id, 30);
    if (typeof window !== "undefined") {
      localStorage.setItem(ACTIVE_TENANT_STORAGE_KEY, tenant.id);
    }
    if (user) {
      const updatedUser: AuthUser = {
        ...user,
        tenantId: tenant.id,
        tenantName: tenant.name,
        activeTenant: tenant,
        roleLabel:
          tenant.role === "owner"
            ? "Propietario de Organización"
            : tenant.role === "admin"
            ? "Administrador de Tenant"
            : "Asesor CRM",
      };
      setUser(updatedUser);
      saveSession(updatedUser);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const { authUser } = await syncTenantsForUser(session.user);
          saveSession(authUser, session.access_token);
        } else {
          // Si no hay sesión válida en Supabase, limpiar cualquier resto
          clearSession();
          if (mounted) {
            setUser(null);
            setTenants([]);
            setActiveTenantState(null);
          }
        }
      } catch (e) {
        console.warn("Supabase Auth no disponible:", e);
        if (mounted) {
          setUser(null);
          setTenants([]);
          setActiveTenantState(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initSession();

    // Escuchar cambios de autenticación en Supabase
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const { authUser } = await syncTenantsForUser(session.user);
        saveSession(authUser, session.access_token);
      } else if (event === "SIGNED_OUT") {
        clearSession();
        setUser(null);
        setTenants([]);
        setActiveTenantState(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [syncTenantsForUser]);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    if (!email.trim() || !pass.trim()) {
      return { success: false, error: "Por favor ingresa tu correo y contraseña." };
    }

    try {
      // Autenticación estricta en Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass.trim(),
      });

      if (error) {
        const msg =
          error.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos. Verifica tus credenciales de Supabase."
            : error.message;
        return { success: false, error: msg };
      }

      if (data?.user) {
        const { authUser } = await syncTenantsForUser(data.user);
        saveSession(authUser, data.session?.access_token);

        startTransition(() => {
          router.push("/");
          router.refresh();
        });

        return { success: true };
      }

      return { success: false, error: "No se pudo obtener información del usuario desde Supabase." };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || "Error al conectar con los servidores de Supabase Auth.",
      };
    }
  };

  const logout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Error signing out from Supabase:", e);
    } finally {
      clearSession();
      setUser(null);
      setTenants([]);
      setActiveTenantState(null);
      startTransition(() => {
        router.push("/login");
        router.refresh();
      });
    }
  };

  const can = (permission: Permission): boolean => {
    return hasPermission(user, permission);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        tenants,
        activeTenant,
        setActiveTenant,
        refreshTenants,
        login,
        logout,
        can,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe ser utilizado dentro de un AuthProvider");
  }
  return context;
}
