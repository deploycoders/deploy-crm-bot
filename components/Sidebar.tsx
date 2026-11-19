"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { playMessageChime, initAudio } from "@/lib/sound";
import { tenantRequestHeaders } from "@/lib/tenantClient";
import {
  getNotificationPermission,
  isPushEnabled,
  requestNotificationPermission,
  setPushEnabled,
  supportsNotifications,
} from "@/lib/notifications";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout, tenants, activeTenant, setActiveTenant, refreshTenants } = useAuth();
  const [handoffCount, setHandoffCount] = useState<number>(0);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pushNotifEnabled, setPushNotifEnabled] = useState<boolean>(false);
  const [pushPermission, setPushPermission] = useState<ReturnType<typeof getNotificationPermission>>("unavailable");

  // Selector de Organización
  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOrgDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Conteo de conversaciones esperando asesor (scoped al tenant activo)
  const fetchHandoffCount = async () => {
    if (!activeTenant?.id) return;
    try {
      const { count, error } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting_agent")
        .eq("tenant_id", activeTenant.id);

      if (!error && count !== null) {
        setHandoffCount(count);
      }
    } catch {
      // Ignorar errores de red
    }
  };

  // Conteo de mensajes no leídos (scoped al tenant activo)
  const fetchUnreadCount = async () => {
    if (!activeTenant?.id) return;
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("unread_count")
        .eq("tenant_id", activeTenant.id)
        .gt("unread_count", 0);

      if (!error && data) {
        const total = data.reduce((acc, c) => acc + (c.unread_count || 0), 0);
        setUnreadCount(total);
      }
    } catch {
      // Ignorar errores de red
    }
  };

  useEffect(() => {
    fetchHandoffCount();
    fetchUnreadCount();

    setPushPermission(getNotificationPermission());
    setPushNotifEnabled(isPushEnabled());

    if (!activeTenant?.id) return;

    const channel = supabase
      .channel(`sidebar-realtime-${activeTenant.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `tenant_id=eq.${activeTenant.id}`,
        },
        () => {
          fetchHandoffCount();
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTenant?.id]);

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

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    setOrgError(null);

    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setOrgError(data.error || "No se pudo crear la organización.");
      } else {
        setNewOrgName("");
        setShowCreateOrgModal(false);
        await refreshTenants();
        if (data.tenant) {
          setActiveTenant(data.tenant);
        }
      }
    } catch (err: any) {
      setOrgError(err?.message || "Error al conectar con el servidor.");
    } finally {
      setCreatingOrg(false);
    }
  };

  const userName = user?.name || user?.email?.split("@")[0] || "Admin";
  const userInitials = userName.slice(0, 2).toUpperCase();
  const isSuperAdmin =
    user?.role === "superadmin" ||
    user?.permissions?.includes("*") ||
    user?.email?.toLowerCase() === "admin@salesbot.crm";

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
      href: "/catalogo",
      label: "Catálogo & Stock",
      icon: "inventory_2",
      activeMatch: (path: string) => path.startsWith("/catalogo"),
    },
    {
      href: "/equipo",
      label: "Equipo",
      icon: "group",
      activeMatch: (path: string) => path.startsWith("/equipo"),
    },
    ...(isSuperAdmin
      ? [
          {
            href: "/admin/tenants",
            label: "Tenants Master",
            icon: "domain",
            badge: "SaaS",
            badgeClass: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
            activeMatch: (path: string) => path.startsWith("/admin/tenants"),
          },
        ]
      : []),
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

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-72 bg-surface-container-lowest z-50 flex-col justify-between border-r border-surface-container-high/60 shadow-[0_1px_8px_rgba(0,0,0,0.4)]">
        <div className="flex flex-col">
          {/* Header de la Marca */}
          <div className="p-4 border-b border-surface-container-high/40">
            <div className="flex items-center justify-between mb-3">
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

            {/* SELECTOR DE ORGANIZACIÓN / TENANT */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-surface-container-high/70 transition-all text-left group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-7 rounded-lg bg-primary/15 text-primary border border-primary/30 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[16px]">domain</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface truncate group-hover:text-primary transition-colors">
                      {activeTenant?.name || "Sin Organización"}
                    </p>
                    <p className="text-[10px] text-on-surface-variant capitalize leading-tight">
                      {activeTenant?.role ? `Rol: ${activeTenant.role}` : "Modo Multitenant"}
                    </p>
                  </div>
                </div>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant group-hover:text-on-surface transition-transform">
                  {isOrgDropdownOpen ? "expand_less" : "unfold_more"}
                </span>
              </button>

              {/* Menú Desplegable de Organizaciones */}
              {isOrgDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1.5 bg-[#081829] border border-surface-container-high/90 rounded-xl shadow-2xl p-1.5 z-50 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-outline border-b border-surface-container-high/40 mb-1">
                    Mis Organizaciones
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {tenants.map((t) => {
                      const isSelected = t.id === activeTenant?.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setActiveTenant(t);
                            setIsOrgDropdownOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition text-left ${
                            isSelected
                              ? "bg-primary/20 text-primary border border-primary/30 font-bold"
                              : "text-slate-300 hover:bg-surface-container hover:text-white"
                          }`}
                        >
                          <span className="truncate">{t.name}</span>
                          <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-surface-container-high/50 text-slate-400">
                            {t.role}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-1.5 pt-1.5 border-t border-surface-container-high/40 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOrgDropdownOpen(false);
                        setShowCreateOrgModal(true);
                      }}
                      className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-primary hover:bg-primary/10 transition font-semibold"
                    >
                      <span className="material-symbols-outlined text-[15px]">add_circle</span>
                      <span>Nueva Organización</span>
                    </button>

                    {isSuperAdmin && (
                      <Link
                        href="/admin/tenants"
                        onClick={() => setIsOrgDropdownOpen(false)}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition font-semibold"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[15px]">shield</span>
                          <span>Portal Master Tenants</span>
                        </div>
                        <span className="text-[10px] uppercase font-mono px-1 rounded bg-emerald-500/20 text-emerald-300">
                          SaaS
                        </span>
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Menú de Navegación */}
          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const active = item.activeMatch(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    active
                      ? "bg-surface-container-high text-primary font-bold shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        active ? "text-primary" : "text-outline"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${item.badgeClass}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Pie del Sidebar */}
        <div className="p-4 space-y-3 border-t border-surface-container-high/40">
          {/* Handoff Queue Widget */}
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
                <span className="text-xs text-on-surface-variant mt-0.5 truncate max-w-[140px]">
                  {user?.email ? user.email : "Usuario CRM"}
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

      {/* MODAL CREAR ORGANIZACIÓN */}
      {showCreateOrgModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl border border-surface-container-high bg-[#0a192a] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/15 text-primary border border-primary/30">
                  <span className="material-symbols-outlined text-[18px]">domain_add</span>
                </span>
                <h3 className="text-sm font-bold text-white">Nueva Organización</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateOrgModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nombre de la Organización
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Ej: Inversiones Caracas, C.A."
                  required
                  className="w-full rounded-xl border border-surface-container-high bg-black/40 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary transition"
                />
              </div>

              {orgError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg p-2">
                  {orgError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateOrgModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingOrg || !newOrgName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary text-[#003824] hover:bg-emerald-300 transition disabled:opacity-40"
                >
                  {creatingOrg ? "Creando..." : "Crear Organización"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
