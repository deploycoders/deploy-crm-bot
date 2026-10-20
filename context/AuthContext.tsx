"use client";

import React, { createContext, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  AuthUser,
  Permission,
  clearSession,
  hasPermission,
  loadSession,
  saveSession,
} from "@/lib/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  can: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function mapSupabaseUserToAuthUser(sbUser: any): AuthUser {
  const metadata = sbUser.user_metadata || {};
  return {
    id: sbUser.id,
    email: sbUser.email || "",
    name: metadata.name || (sbUser.email ? sbUser.email.split("@")[0] : "Usuario"),
    role: metadata.role || "superadmin",
    roleLabel: metadata.roleLabel || "Super Administrador (Acceso Total)",
    permissions: (metadata.permissions as Permission[]) || ["*"],
    avatar: metadata.avatar || "https://api.dicebear.com/7.x/bottts/svg?seed=SalesBotAdmin&backgroundColor=08111f",
    loggedAt: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    let mounted = true;

    async function initSession() {
      try {
        // 1. Verificar sesión activa directamente en Supabase Auth
        const { data: { session }, error } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          const authUser = mapSupabaseUserToAuthUser(session.user);
          setUser(authUser);
          saveSession(authUser);
        } else {
          // Si no hay sesión válida en Supabase, limpiamos
          clearSession();
          if (mounted) setUser(null);
        }
      } catch (e) {
        console.error("Error al inicializar sesión de Supabase Auth:", e);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initSession();

    // 2. Escuchar cambios de estado en Supabase Auth en tiempo real
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.user) {
        const authUser = mapSupabaseUserToAuthUser(session.user);
        setUser(authUser);
        saveSession(authUser);
      } else if (event === "SIGNED_OUT") {
        clearSession();
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    if (!email.trim() || !pass.trim()) {
      return { success: false, error: "Por favor ingresa tu correo y contraseña." };
    }

    try {
      // Autenticación estricta contra Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass.trim(),
      });

      if (error) {
        const msg =
          error.message === "Invalid login credentials"
            ? "Correo o contraseña incorrectos. Verifica tus datos de Supabase."
            : error.message;
        return { success: false, error: msg };
      }

      if (data?.user) {
        const authUser = mapSupabaseUserToAuthUser(data.user);
        saveSession(authUser);
        setUser(authUser);

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
