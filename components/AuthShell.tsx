"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { GlobalNotifications } from "@/components/GlobalNotifications";
import { Bot, ShieldCheck } from "lucide-react";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated && !isLoginPage) {
        router.replace("/login");
      } else if (isAuthenticated && isLoginPage) {
        router.replace("/");
      }
    }
  }, [isAuthenticated, loading, isLoginPage, router]);

  // Si estamos en la página de Login, renderizamos directamente sin envolver en Sidebar
  if (isLoginPage) {
    return <>{children}</>;
  }

  // Si aún está cargando la sesión
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-ink p-4 text-center">
        <div className="relative">
          <div className="size-16 rounded-2xl border border-signal/40 bg-signal/10 shadow-glow grid place-items-center animate-pulse">
            <Bot className="size-8 text-signal" />
          </div>
          <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-panel border border-signal/60 grid place-items-center">
            <ShieldCheck className="size-3 text-signal" />
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold tracking-wide text-white">
          SalesBot CRM
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Autenticando nivel de seguridad y permisos...
        </p>
      </div>
    );
  }

  // Si no está autenticado, no mostramos el layout mientras redirige
  if (!isAuthenticated) {
    return null;
  }

  // Usuario autenticado en rutas protegidas
  return (
    <>
      <GlobalNotifications />
      <div className="min-h-screen lg:h-screen lg:overflow-hidden lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 h-full overflow-y-auto px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
          {children}
        </main>
      </div>
    </>
  );
}
