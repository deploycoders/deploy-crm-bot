"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Filter,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  User,
} from "lucide-react";
import {
  getLocalAuditLog,
  clearLocalAuditLog,
  formatAuditAction,
  type AuditEvent,
  type AuditAction,
} from "@/lib/audit";
import { usePermissions } from "@/lib/permissions";

const ACTION_ICONS: Partial<Record<AuditAction, string>> = {
  "agent:message_sent": "💬",
  "agent:takeover": "🛡️",
  "agent:handover_to_ai": "🤖",
  "agent:resolved": "✅",
  "agent:tag_added": "🏷️",
  "agent:tag_removed": "🗑️",
  "agent:lead_assigned": "👤",
  "agent:note_saved": "📝",
  "agent:export_csv": "📊",
  "agent:pipeline_stage_changed": "⚙️",
  "auth:login": "🔑",
  "auth:logout": "🚪",
};

const ACTION_COLORS: Partial<Record<AuditAction, string>> = {
  "agent:message_sent": "text-sky-300 border-sky-500/30 bg-sky-500/10",
  "agent:takeover": "text-amber-300 border-amber-500/30 bg-amber-500/10",
  "agent:handover_to_ai": "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  "agent:resolved": "text-green-300 border-green-500/30 bg-green-500/10",
  "agent:tag_added": "text-purple-300 border-purple-500/30 bg-purple-500/10",
  "agent:tag_removed": "text-rose-300 border-rose-500/30 bg-rose-500/10",
  "agent:lead_assigned": "text-blue-300 border-blue-500/30 bg-blue-500/10",
  "agent:note_saved": "text-slate-300 border-slate-500/30 bg-slate-500/10",
  "agent:export_csv": "text-orange-300 border-orange-500/30 bg-orange-500/10",
  "agent:pipeline_stage_changed": "text-cyan-300 border-cyan-500/30 bg-cyan-500/10",
  "auth:login": "text-signal border-signal/30 bg-signal/10",
  "auth:logout": "text-slate-400 border-slate-500/30 bg-slate-500/10",
};

export default function AuditLogPage() {
  const { can, isSuperAdmin } = usePermissions();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);

  const loadEvents = async () => {
    try {
      // Primero cargar del cache local
      const local = getLocalAuditLog();
      setEvents(local);

      // Luego intentar cargar del servidor
      const res = await fetch("/api/audit?limit=100");
      if (res.ok) {
        const data = await res.json();
        if (data.events && data.events.length > 0) {
          // Merge: combinar servidor + local, deduplicar por id
          const serverEvents: AuditEvent[] = data.events.map((e: any) => ({
            id: e.id || `srv_${e.created_at}`,
            action: e.action,
            userId: e.user_id,
            userName: e.user_name,
            conversationId: e.conversation_id,
            contactId: e.contact_id,
            metadata: e.metadata,
            timestamp: e.created_at,
          }));
          const merged = [...local, ...serverEvents].reduce(
            (acc, ev) => {
              if (!acc.find((x) => x.id === ev.id)) acc.push(ev);
              return acc;
            },
            [] as AuditEvent[]
          );
          merged.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );
          setEvents(merged);
        }
      }
    } catch {
      // Silencioso — solo usamos el cache local
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEvents();
  };

  const handleClearLocal = () => {
    if (confirm("¿Borrar el historial local? Los registros del servidor se conservan.")) {
      clearLocalAuditLog();
      setEvents([]);
    }
  };

  // Opciones únicas de acción para el filtro
  const actionOptions = useMemo(() => {
    const actions = [...new Set(events.map((e) => e.action))];
    return actions.sort();
  }, [events]);

  const filtered = useMemo(() => {
    let base = events;
    if (filterAction !== "all") {
      base = base.filter((e) => e.action === filterAction);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      base = base.filter(
        (e) =>
          e.action.toLowerCase().includes(q) ||
          e.userName.toLowerCase().includes(q) ||
          (e.conversationId || "").toLowerCase().includes(q) ||
          JSON.stringify(e.metadata || {}).toLowerCase().includes(q)
      );
    }
    return base;
  }, [events, filterAction, search]);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleString("es-ES", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts;
    }
  };

  // Stats rápidas
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    return {
      total: events.length,
      today: events.filter((e) => new Date(e.timestamp).toDateString() === today).length,
      messages: events.filter((e) => e.action === "agent:message_sent").length,
      takeovers: events.filter((e) => e.action === "agent:takeover").length,
    };
  }, [events]);

  return (
    <div className="min-h-screen bg-ink p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-signal mb-1">
              Sistema de Seguridad
            </p>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <ClipboardList className="size-6 text-signal" />
              Audit Log
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Registro completo de acciones del equipo de asesores
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Actualizar
            </button>

            {isSuperAdmin && (
              <button
                onClick={handleClearLocal}
                className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
              >
                <Trash2 className="size-3.5" />
                Limpiar Local
              </button>
            )}

            <Link
              href="/equipo"
              className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <ArrowLeft className="size-3.5" />
              Equipo
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total registros", value: stats.total, icon: ClipboardList, cls: "text-white" },
            { label: "Hoy", value: stats.today, icon: Clock, cls: "text-signal" },
            { label: "Mensajes enviados", value: stats.messages, icon: MessageSquare, cls: "text-sky-300" },
            { label: "Intervenciones", value: stats.takeovers, icon: Shield, cls: "text-amber-300" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-line bg-panel/80 p-4 space-y-2">
              <s.icon className={`size-4 ${s.cls}`} />
              <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Aviso si no hay acceso de admin */}
        {!can("admin.audit_log") && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <AlertCircle className="size-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">
              <span className="font-semibold">Vista limitada.</span> Solo ves el historial local de esta sesión. El historial completo del servidor requiere permisos de administrador.
            </p>
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-line bg-panel/80 p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar en el log..."
                className="w-48 rounded-lg border border-line bg-ink/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-signal/50 transition"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Filter className="size-3.5 text-slate-500" />
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="rounded-lg border border-line bg-ink/60 px-2.5 py-1.5 text-xs text-white outline-none focus:border-signal/50 transition"
              >
                <option value="all">Todas las acciones</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>
                    {formatAuditAction(a as AuditAction)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="text-[10px] text-slate-500">
            {filtered.length} de {events.length} eventos
          </span>
        </div>

        {/* Tabla de eventos */}
        <div className="rounded-xl border border-line bg-panel/80 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto size-6 animate-spin rounded-full border-2 border-signal border-t-transparent mb-3" />
              <p className="text-sm text-slate-500">Cargando audit log...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <ClipboardList className="size-10 mx-auto text-slate-700 mb-3" />
              <p className="text-sm">Sin eventos registrados</p>
              <p className="text-xs text-slate-600 mt-1">
                Las acciones del equipo aparecerán aquí automáticamente
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line/50">
              {/* Encabezado */}
              <div className="hidden sm:grid grid-cols-[160px_1fr_180px_160px] gap-4 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Acción</span>
                <span>Detalles</span>
                <span>Asesor</span>
                <span>Fecha / Hora</span>
              </div>

              {filtered.map((event) => {
                const icon = ACTION_ICONS[event.action] || "📋";
                const colorCls =
                  ACTION_COLORS[event.action] ||
                  "text-slate-300 border-slate-500/30 bg-slate-500/10";

                return (
                  <div
                    key={event.id}
                    className="grid grid-cols-1 sm:grid-cols-[160px_1fr_180px_160px] gap-2 sm:gap-4 px-4 py-3 hover:bg-white/[0.02] transition items-start"
                  >
                    {/* Acción */}
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${colorCls}`}
                      >
                        <span>{icon}</span>
                        <span>{formatAuditAction(event.action)}</span>
                      </span>
                    </div>

                    {/* Detalles */}
                    <div className="min-w-0">
                      {event.conversationId && (
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          Conv: <span className="text-slate-400">{event.conversationId}</span>
                        </p>
                      )}
                      {event.metadata && Object.keys(event.metadata).length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {Object.entries(event.metadata)
                            .slice(0, 3)
                            .map(([k, v]) => (
                              <p key={k} className="text-[10px] text-slate-600 truncate">
                                <span className="text-slate-500">{k}:</span>{" "}
                                {typeof v === "object" ? JSON.stringify(v) : String(v)}
                              </p>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Asesor */}
                    <div className="flex items-center gap-1.5">
                      <User className="size-3 text-slate-500 shrink-0" />
                      <span className="text-xs text-slate-300 truncate">{event.userName}</span>
                    </div>

                    {/* Timestamp */}
                    <div className="text-[10px] text-slate-500 font-mono">
                      {formatTime(event.timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info de fuente */}
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <CheckCircle2 className="size-3.5 text-emerald-500/60" />
          <span>
            Los eventos locales se guardan en este navegador.
            {isSuperAdmin && " Los eventos del servidor se persisten en Supabase (tabla audit_log)."}
          </span>
        </div>
      </div>
    </div>
  );
}
