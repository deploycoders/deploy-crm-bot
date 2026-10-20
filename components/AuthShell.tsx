"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { BottomNav } from "@/components/BottomNav";
import { GlobalNotifications } from "@/components/GlobalNotifications";

export function AuthShell({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading } = useAuth();
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

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
        <div className="relative">
          <div className="size-14 rounded-2xl border border-primary/40 bg-primary/10 shadow-glow grid place-items-center animate-pulse">
            <span className="material-symbols-outlined text-primary text-[28px]">smart_toy</span>
          </div>
          <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-surface-container border border-primary/60 grid place-items-center">
            <span className="material-symbols-outlined text-primary text-[12px]">verified_user</span>
          </div>
        </div>
        <p className="mt-5 text-sm font-semibold tracking-wide text-on-surface">
          SalesBot CRM • Deploy Cockpit
        </p>
        <p className="mt-1 text-xs text-on-surface-variant">
          Iniciando telemetría y entorno de operaciones...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const userInitial = user?.name ? user.name.slice(0, 2).toUpperCase() : "JE";

  // Determinar subtítulo para el header móvil
  const getMobileSubtitle = () => {
    if (pathname === "/") return "Dashboard";
    if (pathname.startsWith("/chat")) return "Bandeja de Mensajes";
    if (pathname.startsWith("/contactos")) return "Directorio de Contactos";
    if (pathname.startsWith("/pipeline")) return "Flujos & Pipeline";
    if (pathname.startsWith("/equipo")) return "Gestión de Equipo";
    if (pathname.startsWith("/configuracion")) return "Configuración";
    return "Deploy Cockpit";
  };

  return (
    <>
      <GlobalNotifications />
      <div className="min-h-screen bg-background text-on-surface">
        {/* Sidebar Fijo a la Izquierda en Pantallas Medianas/Grandes */}
        <Sidebar />

        {/* Zona de contenido principal adaptativa */}
        <div className="pl-0 md:pl-72 transition-all">
          {/* Header Mobile Sticky (Diseño de la Referencia) */}
          <header className="md:hidden sticky top-0 z-40 bg-[#051424]/95 backdrop-blur-xl border-b border-[#1c2b3c]/80 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
                <span className="material-symbols-outlined text-[20px]">smart_toy</span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-sm text-on-surface tracking-tight">SalesBot CRM</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                    LIVE
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                  {getMobileSubtitle()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="size-9 rounded-full bg-surface-container-low border border-surface-container-high/60 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
                title="Notificaciones"
              >
                <span className="material-symbols-outlined text-[19px]">notifications</span>
              </button>
              <div
                className="size-9 rounded-full bg-primary flex items-center justify-center text-[#003824] font-bold text-xs shadow-md"
                title={user?.name || "Usuario"}
              >
                <span className="material-symbols-outlined text-[19px]">person</span>
              </div>
            </div>
          </header>

          {/* Top Header Fijo para Desktop */}
          <header className="hidden md:flex fixed top-0 left-72 right-0 h-16 bg-surface-container-lowest/80 backdrop-blur-xl border-b border-surface-container-high/40 z-40 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px] text-primary">terminal</span>
                <span className="text-xs uppercase tracking-wider text-outline font-medium">
                  Operational Environment: Production
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-surface-container-high/40">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                <span className="text-xs text-on-surface font-medium">
                  WhatsApp Gateway: 99.98% SLA
                </span>
              </div>
              <div className="w-px h-6 bg-surface-container-high"></div>
              <button
                className="w-8 h-8 rounded-lg bg-surface-container-low border border-surface-container-high/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:border-primary/40 transition-colors"
                type="button"
                title="Notificaciones"
              >
                <span className="material-symbols-outlined text-[18px]">notifications</span>
              </button>
              <div
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-on-primary font-bold text-xs shadow-sm cursor-pointer"
                title={user?.name || "Jesús"}
              >
                {userInitial}
              </div>
            </div>
          </header>

          {/* Main Area */}
          <main className="relative pt-0 md:pt-16 pb-20 md:pb-8 bg-background min-h-screen">
            {children}
          </main>
        </div>

        {/* Barra de Navegación Inferior para Móviles (BottomNav) */}
        <BottomNav />
      </div>
    </>
  );
}
