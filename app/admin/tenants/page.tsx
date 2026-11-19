"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  PauseCircle,
  Phone,
  PlayCircle,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { tenantRequestHeaders } from "@/lib/tenantClient";

interface EnrichedTenant {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
  conversationCount: number;
  owner: {
    userId: string | null;
    email: string;
    name: string;
  };
  whatsapp: {
    id: string;
    phoneNumberId: string;
    displayName: string;
    isActive: boolean;
    hasCustomToken: boolean;
  } | null;
}

export default function TenantsMasterPage() {
  const router = useRouter();
  const { user, can, setActiveTenant, refreshTenants } = useAuth();
  const isSuperAdmin = user?.role === "superadmin" || can("*");

  const [tenants, setTenants] = useState<EnrichedTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "suspended">("all");
  const [refreshing, setRefreshing] = useState(false);

  // Modal para registrar nueva empresa
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formOwnerEmail, setFormOwnerEmail] = useState("");
  const [formOwnerName, setFormOwnerName] = useState("");
  const [formInitialPassword, setFormInitialPassword] = useState("");
  const [formPhoneId, setFormPhoneId] = useState("");
  const [formAccessToken, setFormAccessToken] = useState("");

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/admin/tenants", { headers });
      const data = await res.json();
      if (data.success && data.tenants) {
        setTenants(data.tenants);
      }
    } catch (err) {
      console.warn("Error cargando tenants:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Entrar al CRM del cliente en Modo Soporte
  const handleOpenClientCRM = async (tenant: EnrichedTenant) => {
    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/admin/tenants/impersonate", {
        method: "POST",
        headers,
        body: JSON.stringify({ tenantId: tenant.id }),
      });
      const data = await res.json();
      if (data.success && data.tenant) {
        await refreshTenants();
        setActiveTenant(data.tenant);
        router.push("/");
      } else {
        alert(data.error || "No se pudo acceder a la organización.");
      }
    } catch {
      alert("Error de conexión al acceder a la organización.");
    }
  };

  // Alternar estado activo / suspendido
  const handleToggleStatus = async (tenant: EnrichedTenant) => {
    const nextStatus = !tenant.isActive;
    const actionLabel = nextStatus ? "reactivar" : "suspender";
    if (!confirm(`¿Deseas ${actionLabel} la organización '${tenant.name}'?`)) return;

    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ tenantId: tenant.id, isActive: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setTenants((prev) =>
          prev.map((t) => (t.id === tenant.id ? { ...t, isActive: nextStatus } : t))
        );
      } else {
        alert(data.error || "No se pudo actualizar el estado");
      }
    } catch {
      alert("Error al comunicarse con el servidor");
    }
  };

  // Registrar nueva empresa
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    setCreating(true);
    setCreateError(null);

    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          ownerEmail: formOwnerEmail.trim() || undefined,
          ownerName: formOwnerName.trim() || undefined,
          initialPassword: formInitialPassword.trim() || undefined,
          whatsappPhoneNumberId: formPhoneId.trim() || undefined,
          whatsappAccessToken: formAccessToken.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setCreateError(data.error || "Error al registrar empresa.");
      } else {
        setShowCreateModal(false);
        setFormName("");
        setFormSlug("");
        setFormOwnerEmail("");
        setFormOwnerName("");
        setFormInitialPassword("");
        setFormPhoneId("");
        setFormAccessToken("");
        fetchTenants();
        await refreshTenants();
      }
    } catch (err: any) {
      setCreateError(err?.message || "Error al conectar con el servidor.");
    } finally {
      setCreating(false);
    }
  };

  // Filtrado de tenants
  const filteredTenants = useMemo(() => {
    return tenants.filter((t) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        t.owner.email.toLowerCase().includes(q) ||
        t.owner.name.toLowerCase().includes(q);

      let matchStatus = true;
      if (filterStatus === "active") matchStatus = t.isActive;
      if (filterStatus === "suspended") matchStatus = !t.isActive;

      return matchSearch && matchStatus;
    });
  }, [tenants, search, filterStatus]);

  // Métricas globales
  const totalTenants = tenants.length;
  const activeCount = tenants.filter((t) => t.isActive).length;
  const suspendedCount = totalTenants - activeCount;
  const totalConvs = tenants.reduce((acc, t) => acc + t.conversationCount, 0);
  const waConnectedCount = tenants.filter((t) => t.whatsapp?.phoneNumberId).length;

  if (!isSuperAdmin) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center p-6 text-center">
        <div className="max-w-md rounded-2xl border border-rose-500/30 bg-rose-500/10 p-8">
          <ShieldAlert className="size-12 text-rose-400 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-white">Acceso Restringido</h2>
          <p className="text-xs text-rose-300 mt-1">
            Esta sección es el Portal Maestro de Plataforma y requiere privilegios de Super Administrador.
          </p>
          <Link
            href="/"
            className="mt-4 inline-block px-4 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white transition"
          >
            ← Volver al Cockpit
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-signal" />
            <span className="text-xs font-semibold tracking-wider uppercase text-signal">
              SaaS Control Plane • Super Administrador
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Directorio Maestro de Empresas</span>
            <span className="text-xs font-mono text-emerald-400 border border-emerald-500/30 rounded-lg px-2 py-0.5 bg-emerald-500/10">
              Multitenant v2.0
            </span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Aprovisiona clientes, asigna canales de WhatsApp y entra al CRM de cada negocio para soporte técnico.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              fetchTenants();
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setShowCreateModal(true);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-signal px-4 py-2 text-xs font-bold text-ink shadow-glow hover:bg-emerald-300 active:scale-95 transition cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Registrar Empresa</span>
          </button>
        </div>
      </header>

      {/* Tarjetas de Métricas Globales de Plataforma */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-panel/70 p-4 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Clientes</span>
            <Building2 className="size-4 text-primary" />
          </div>
          <p className="text-2xl font-bold text-white">{totalTenants}</p>
          <p className="text-[11px] text-slate-400">Organizaciones registradas</p>
        </div>

        <div className="rounded-xl border border-line bg-panel/70 p-4 space-y-1">
          <div className="flex items-center justify-between text-emerald-400">
            <span className="text-xs font-semibold">Tenants Activos</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-300">{activeCount}</p>
          <p className="text-[11px] text-slate-400">{suspendedCount} suspendidos</p>
        </div>

        <div className="rounded-xl border border-line bg-panel/70 p-4 space-y-1">
          <div className="flex items-center justify-between text-sky-400">
            <span className="text-xs font-semibold">Canales WhatsApp</span>
            <Phone className="size-4 text-sky-400" />
          </div>
          <p className="text-2xl font-bold text-white">{waConnectedCount}</p>
          <p className="text-[11px] text-slate-400">Líneas Meta vinculadas</p>
        </div>

        <div className="rounded-xl border border-line bg-panel/70 p-4 space-y-1">
          <div className="flex items-center justify-between text-amber-400">
            <span className="text-xs font-semibold">Total Conversaciones</span>
            <MessageSquare className="size-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300">{totalConvs}</p>
          <p className="text-[11px] text-slate-400">Leads en la plataforma</p>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, slug o dueño..."
            className="w-full rounded-xl border border-line bg-panel/80 pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary transition"
          />
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterStatus === "all"
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Todos ({totalTenants})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("active")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterStatus === "active"
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Activos ({activeCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("suspended")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              filterStatus === "suspended"
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            Suspendidos ({suspendedCount})
          </button>
        </div>
      </div>

      {/* Tabla Principal de Tenants */}
      <div className="rounded-xl border border-line bg-panel/70 backdrop-blur-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-container-high/40 text-[11px] font-bold uppercase tracking-wider text-slate-400 border-b border-line">
              <tr>
                <th className="py-3 px-4">Empresa / Tenant</th>
                <th className="py-3 px-4">Dueño (Owner)</th>
                <th className="py-3 px-4">Canal WhatsApp</th>
                <th className="py-3 px-4 text-center">Equipo</th>
                <th className="py-3 px-4 text-center">Chats</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-right">Acceso Soporte</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="size-6 animate-spin mx-auto mb-2 text-primary" />
                    <span>Cargando organizaciones de la plataforma...</span>
                  </td>
                </tr>
              ) : filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <Building2 className="size-8 mx-auto mb-2 text-slate-600" />
                    <p className="font-semibold text-white">No se encontraron organizaciones</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Usa el botón &quot;Registrar Empresa&quot; para crear el primer cliente.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTenants.map((t) => {
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition">
                      {/* Empresa / Tenant */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-lg bg-primary/10 border border-primary/20 text-primary font-bold flex items-center justify-center shrink-0">
                            {t.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-white block truncate max-w-[180px]">
                              {t.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              slug: {t.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Dueño */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs">
                          <p className="font-medium text-slate-200">{t.owner.name}</p>
                          <p className="text-[11px] text-slate-400 font-mono truncate max-w-[180px]">
                            {t.owner.email}
                          </p>
                        </div>
                      </td>

                      {/* Canal WhatsApp */}
                      <td className="py-3.5 px-4">
                        {t.whatsapp ? (
                          <div className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            <span className="text-xs text-slate-200 font-mono truncate max-w-[140px]" title={t.whatsapp.phoneNumberId}>
                              {t.whatsapp.phoneNumberId}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">Sin canal configurado</span>
                        )}
                      </td>

                      {/* Miembros */}
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-200">
                        {t.memberCount}
                      </td>

                      {/* Conversaciones */}
                      <td className="py-3.5 px-4 text-center font-semibold text-amber-300">
                        {t.conversationCount}
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(t)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                            t.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20"
                          }`}
                          title={t.isActive ? "Clic para suspender cliente" : "Clic para activar cliente"}
                        >
                          {t.isActive ? (
                            <>
                              <PlayCircle className="size-3" />
                              <span>Activo</span>
                            </>
                          ) : (
                            <>
                              <PauseCircle className="size-3" />
                              <span>Suspendido</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Acceso Soporte */}
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleOpenClientCRM(t)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 hover:bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary transition active:scale-95 cursor-pointer shadow-sm"
                          title="Entrar a este tenant para ver sus chats y configuración"
                        >
                          <span>Abrir CRM</span>
                          <ExternalLink className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL PARA REGISTRAR NUEVA EMPRESA */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/15 text-primary border border-primary/30">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Registrar Nueva Empresa / Tenant</h3>
                  <p className="text-xs text-slate-400">
                    Crea la organización y asigna las credenciales del cliente
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="size-8 rounded-lg border border-line bg-white/5 text-slate-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTenant} className="space-y-4">
              {/* Información de la Organización */}
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-signal">
                  1. Datos de la Organización
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nombre de la Empresa *
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="Ej: Distribuidora Los Andes, C.A."
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Identificador Slug (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formSlug}
                      onChange={(e) => setFormSlug(e.target.value)}
                      placeholder="los-andes"
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Dueño / Cliente */}
              <div className="space-y-3 pt-2 border-t border-line">
                <p className="text-xs font-bold uppercase tracking-wider text-signal">
                  2. Acceso del Propietario (Cliente)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Correo Electrónico *
                    </label>
                    <input
                      type="email"
                      value={formOwnerEmail}
                      onChange={(e) => setFormOwnerEmail(e.target.value)}
                      placeholder="dueño@empresa.com"
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Nombre del Dueño
                    </label>
                    <input
                      type="text"
                      value={formOwnerName}
                      onChange={(e) => setFormOwnerName(e.target.value)}
                      placeholder="Ej: Carlos Silva"
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Contraseña Inicial (Opcional)
                    </label>
                    <input
                      type="text"
                      value={formInitialPassword}
                      onChange={(e) => setFormInitialPassword(e.target.value)}
                      placeholder="Dejar en blanco para autogenerar contraseña segura"
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Canal de WhatsApp */}
              <div className="space-y-3 pt-2 border-t border-line">
                <p className="text-xs font-bold uppercase tracking-wider text-signal">
                  3. Canal de WhatsApp Cloud API (Opcional)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      Meta Phone Number ID
                    </label>
                    <input
                      type="text"
                      value={formPhoneId}
                      onChange={(e) => setFormPhoneId(e.target.value)}
                      placeholder="Ej: 1304775179385550"
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                      System User Access Token
                    </label>
                    <input
                      type="password"
                      value={formAccessToken}
                      onChange={(e) => setFormAccessToken(e.target.value)}
                      placeholder="EAAZ..."
                      className="w-full rounded-xl border border-line bg-ink px-3.5 py-2 text-xs text-white placeholder:text-slate-600 outline-none focus:border-primary transition font-mono"
                    />
                  </div>
                </div>
              </div>

              {createError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5">
                  {createError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating || !formName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-signal text-ink hover:bg-emerald-300 transition disabled:opacity-40 cursor-pointer shadow-glow"
                >
                  {creating ? "Registrando..." : "Crear Organización"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

