"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { playMessageChime, initAudio } from "@/lib/sound";
import {
  getNotificationPermission,
  isPushEnabled,
  requestNotificationPermission,
  setPushEnabled,
  supportsNotifications,
} from "@/lib/notifications";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [handoffCount, setHandoffCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pushNotifEnabled, setPushNotifEnabled] = useState<boolean>(false);
  const [pushPermission, setPushPermission] = useState<ReturnType<typeof getNotificationPermission>>("unavailable");

  // Conteo real de conversaciones que requieren asesor humano
  const fetchHandoffCount = async () => {
    try {
      const { count, error } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting_agent");

      if (!error && count !== null) {
        setHandoffCount(count);
      }
    } catch {
      // Mantener estado base si Supabase no está conectado
    }
  };

  // Conteo real de mensajes no leídos (sum de unread_count en conversations)
  const fetchUnreadCount = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("unread_count")
        .gt("unread_count", 0);

      if (!error && data) {
        const total = data.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        setUnreadCount(total);
      }
    } catch {
      // Ignorar si Supabase no está disponible
    }
  };

  useEffect(() => {
    fetchHandoffCount();
    fetchUnreadCount();

    // Init push state
    setPushPermission(getNotificationPermission());
    setPushNotifEnabled(isPushEnabled());

    const channel = supabase
      .channel("sidebar-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchHandoffCount();
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      initAudio().then(() => playMessageChime());
    }
  };

  const togglePush = async () => {
    if (!supportsNotifications()) return;
    if (!pushNotifEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPushEnabled(true);
        setPushNotifEnabled(true);
        setPushPermission("granted");
      } else {
        setPushPermission(getNotificationPermission());
      }
    } else {
      setPushEnabled(false);
      setPushNotifEnabled(false);
    }
  };

  // Solo rutas que existen y tienen funcionalidad real
  const navItems = [
    {
      href: "/",
      label: "Dashboard",
      icon: "dashboard",
      activeMatch: (path: string) => path === "/",
    },
    {
      href: "/chat",
      label: "Mensajes",
      icon: "chat",
      badge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount.toString()) : undefined,
      badgeClass: "bg-primary/15 text-primary border border-primary/20",
      activeMatch: (path: string) => path.startsWith("/chat"),
    },
    {
      href: "/pipeline",
      label: "Pipeline (Kanban)",
      icon: "view_kanban",
      activeMatch: (path: string) => path.startsWith("/pipeline"),
    },
    {
      href: "/equipo",
      label: "Equipo",
      icon: "group",
      activeMatch: (path: string) => path.startsWith("/equipo"),
    },
    {
      href: "/admin/audit",
      label: "Audit Log",
      icon: "policy",
      activeMatch: (path: string) => path.startsWith("/admin/audit"),
    },
    {
      href: "/contactos",
      label: "Contactos",
      icon: "groups",
      activeMatch: (path: string) => path.startsWith("/contactos"),
    },
    {
      href: "/configuracion",
      label: "Configuración",
      icon: "settings",
      activeMatch: (path: string) => path.startsWith("/configuracion"),
    },
  ];

  const userName = user?.name || user?.email?.split("@")[0] || "Admin";
  const userInitials = userName.slice(0, 2).toUpperCase();

  return (
    <aside className="hidden md:flex fixed left-0 top-0 h-full w-72 bg-surface-container-lowest z-50 flex-col justify-between border-r border-surface-container-high/60 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
      <div className="flex flex-col">
        {/* Header de la Marca */}
        <div className="p-5 border-b border-surface-container-high/40">
          <div className="flex items-center justify-between mb-2">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="material-symbols-outlined text-primary text-[22px] transition-transform group-hover:scale-110">
                smart_toy
              </span>
              <span className="font-semibold text-sm text-on-surface tracking-tight">
                SalesBot CRM
              </span>
            </Link>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">
                Live
              </span>
            </div>
          </div>
          <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-outline-variant"></span>
            Deploy AI Cockpit v2.4
          </div>
        </div>

        {/* Navegación Principal */}
        <nav className="p-4 space-y-1.5">
          {navItems.map((item, idx) => {
            const isActive = item.activeMatch(pathname);

            return (
              <Link
                key={idx}
                href={item.href}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg transition-all group ${
                  isActive
                    ? "bg-surface-container text-primary font-semibold shadow-[inset_0_0_0_1px_rgba(78,222,163,0.35)]"
                    : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[20px] transition-colors ${
                      isActive ? "text-primary" : "group-hover:text-primary"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="text-sm font-semibold">{item.label}</span>
                </div>

                <div className="flex items-center gap-2">
                  {item.badge && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${item.badgeClass}`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Pie del Sidebar */}
      <div className="p-4 space-y-3 border-t border-surface-container-high/40">
        {/* Handoff Queue Widget — solo visible si hay conversaciones pendientes */}
        {handoffCount > 0 && (
          <Link
            href="/chat"
            className="block bg-amber-400/10 rounded-lg p-3 border border-amber-400/30 hover:bg-amber-400/15 transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">
                Handoff Queue
              </span>
              <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
            </div>
            <p className="text-xs text-amber-200 font-medium">
              {handoffCount === 1
                ? "1 prospecto esperando asesor"
                : `${handoffCount} prospectos esperando asesor`}
            </p>
            <span className="text-xs text-amber-300/70 mt-1 block">
              Toca para atender →
            </span>
          </Link>
        )}

        {/* Tarjeta de Usuario */}
        <div className="flex items-center justify-between p-2 bg-surface-container-high/30 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-sm text-primary font-bold border border-primary/20">
              {userInitials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm text-on-surface leading-none font-semibold truncate max-w-[140px]">
                {userName}
              </span>
              <span className="text-xs text-on-surface-variant mt-0.5">
                {user?.email ? user.email : "Admin • Acceso Total"}
              </span>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-7 h-7 rounded flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-error transition-colors"
            title="Cerrar sesión"
            type="button"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        {/* Barra de Telemetría */}
        <div className="pt-2 border-t border-surface-container-high/40 flex items-center justify-between text-xs text-outline">
          <button
            onClick={toggleSound}
            type="button"
            className="flex items-center gap-1 hover:text-primary transition-colors cursor-pointer"
          >
            <span
              className={`material-symbols-outlined text-[13px] ${
                soundEnabled ? "text-primary" : "text-outline"
              }`}
            >
              {soundEnabled ? "volume_up" : "volume_off"}
            </span>
            <span>Sonido {soundEnabled ? "ON" : "OFF"}</span>
          </button>
          <button
            onClick={togglePush}
            type="button"
            disabled={pushPermission === "denied"}
            title={
              pushPermission === "denied"
                ? "Notificaciones bloqueadas en el navegador"
                : pushNotifEnabled
                ? "Desactivar notificaciones push"
                : "Activar notificaciones push"
            }
            className={`flex items-center gap-1 transition-colors cursor-pointer ${
              pushNotifEnabled
                ? "text-primary"
                : pushPermission === "denied"
                ? "text-rose-400/60 cursor-not-allowed"
                : "hover:text-primary"
            }`}
          >
            <span className="material-symbols-outlined text-[13px]">
              {pushNotifEnabled ? "notifications_active" : "notifications_off"}
            </span>
            <span className="hidden sm:inline">
              {pushPermission === "denied" ? "Push OFF" : pushNotifEnabled ? "Push ON" : "Push"}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
