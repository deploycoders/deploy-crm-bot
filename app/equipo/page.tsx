"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BellOff,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Search,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CRM_AGENTS,
  CRMAgent,
  getAllAssignmentsMap,
  getAgentById,
} from "@/lib/agents";
import { getAllTagsMap } from "@/lib/tags";
import {
  getNotificationPermission,
  isPushEnabled,
  requestNotificationPermission,
  setPushEnabled,
  supportsNotifications,
} from "@/lib/notifications";

interface ContactData {
  id: string;
  name: string | null;
  phone: string;
}

interface ConversationData {
  id: string;
  contact_id: string;
  status: "ai_active" | "human_takeover" | "waiting_agent" | "resolved";
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  contacts?: ContactData;
}

interface AgentStats {
  agent: CRMAgent;
  assignedCount: number;
  waitingCount: number;
  activeCount: number;
  resolvedCount: number;
  conversations: ConversationData[];
}

export default function EquipoPage() {
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    ReturnType<typeof getNotificationPermission>
  >("unavailable");
  const [refreshing, setRefreshing] = useState(false);

  // Mapas de asignaciones y tags
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string>>(
    {}
  );

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false });

      if (!error && data) {
        setConversations(data as ConversationData[]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    setAssignmentsMap(getAllAssignmentsMap());

    // Check push notification state
    setPushPermission(getNotificationPermission());
    setPushEnabledState(isPushEnabled());

    // Realtime updates
    const channel = supabase
      .channel("equipo-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchData();
          setAssignmentsMap(getAllAssignmentsMap());
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleTogglePush = async () => {
    if (!supportsNotifications()) return;

    if (!pushEnabled) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setPushEnabled(true);
        setPushEnabledState(true);
        setPushPermission("granted");
      } else {
        setPushPermission(getNotificationPermission());
      }
    } else {
      setPushEnabled(false);
      setPushEnabledState(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setAssignmentsMap(getAllAssignmentsMap());
  };

  // Construir estadísticas por asesor
  const agentStats = useMemo((): AgentStats[] => {
    return CRM_AGENTS.map((agent) => {
      const assigned =
        agent.id === "unassigned"
          ? conversations.filter(
              (c) =>
                !assignmentsMap[c.contact_id] ||
                assignmentsMap[c.contact_id] === "unassigned"
            )
          : conversations.filter(
              (c) => assignmentsMap[c.contact_id] === agent.id
            );

      return {
        agent,
        assignedCount: assigned.length,
        waitingCount: assigned.filter((c) => c.status === "waiting_agent")
          .length,
        activeCount: assigned.filter((c) => c.status === "ai_active").length,
        resolvedCount: assigned.filter((c) => c.status === "resolved").length,
        conversations: assigned,
      };
    });
  }, [conversations, assignmentsMap]);

  // Estadísticas globales
  const totalStats = useMemo(() => {
    return {
      total: conversations.length,
      waiting: conversations.filter((c) => c.status === "waiting_agent").length,
      ai: conversations.filter((c) => c.status === "ai_active").length,
      human: conversations.filter((c) => c.status === "human_takeover").length,
      resolved: conversations.filter((c) => c.status === "resolved").length,
      unassigned: conversations.filter(
        (c) =>
          !assignmentsMap[c.contact_id] ||
          assignmentsMap[c.contact_id] === "unassigned"
      ).length,
    };
  }, [conversations, assignmentsMap]);

  // Conversaciones filtradas para la vista de detalle
  const filteredConversations = useMemo(() => {
    const base =
      selectedAgentId === "all"
        ? conversations
        : selectedAgentId === "unassigned"
        ? conversations.filter(
            (c) =>
              !assignmentsMap[c.contact_id] ||
              assignmentsMap[c.contact_id] === "unassigned"
          )
        : conversations.filter(
            (c) => assignmentsMap[c.contact_id] === selectedAgentId
          );

    if (!searchTerm.trim()) return base;
    const q = searchTerm.toLowerCase();
    return base.filter(
      (c) =>
        (c.contacts?.name || "").toLowerCase().includes(q) ||
        (c.contacts?.phone || "").toLowerCase().includes(q) ||
        (c.last_message_preview || "").toLowerCase().includes(q)
    );
  }, [conversations, assignmentsMap, selectedAgentId, searchTerm]);

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffH = Math.floor(diffMs / 3600000);
      if (diffH < 1) {
        const diffM = Math.floor(diffMs / 60000);
        return diffM < 1 ? "ahora" : `${diffM}m`;
      }
      if (diffH < 24) return `${diffH}h`;
      return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
    } catch {
      return "";
    }
  };

  const getStatusBadge = (status: ConversationData["status"]) => {
    switch (status) {
      case "waiting_agent":
        return "bg-amber-400/15 text-amber-300 border-amber-400/30";
      case "ai_active":
        return "bg-emerald-400/15 text-emerald-300 border-emerald-400/30";
      case "human_takeover":
        return "bg-sky-400/15 text-sky-300 border-sky-400/30";
      case "resolved":
        return "bg-slate-400/15 text-slate-400 border-slate-400/30";
      default:
        return "bg-white/10 text-slate-300 border-line";
    }
  };

  const getStatusLabel = (status: ConversationData["status"]) => {
    switch (status) {
      case "waiting_agent":
        return "Esperando";
      case "ai_active":
        return "IA Activa";
      case "human_takeover":
        return "Asesor";
      case "resolved":
        return "Resuelto";
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen bg-ink p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-signal mb-1">
              Operaciones Multi-Agente
            </p>
            <h1 className="text-2xl font-bold text-white">
              Equipo de Asesores
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Carga de trabajo, asignaciones y rendimiento en tiempo real
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Botón Notificaciones Push */}
            <button
              onClick={handleTogglePush}
              disabled={
                !supportsNotifications() || pushPermission === "denied"
              }
              title={
                pushPermission === "denied"
                  ? "Permiso de notificaciones bloqueado por el navegador"
                  : pushEnabled
                  ? "Desactivar notificaciones push"
                  : "Activar notificaciones push"
              }
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                pushEnabled
                  ? "border-signal/40 bg-signal/10 text-signal hover:bg-signal/20"
                  : pushPermission === "denied"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-400 cursor-not-allowed opacity-60"
                  : "border-line bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
              }`}
            >
              {pushEnabled ? (
                <Bell className="size-3.5" />
              ) : (
                <BellOff className="size-3.5" />
              )}
              <span className="hidden sm:inline">
                {pushPermission === "denied"
                  ? "Push bloqueado"
                  : pushEnabled
                  ? "Push ON"
                  : "Activar Push"}
              </span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">Actualizar</span>
            </button>

            <Link
              href="/chat"
              className="flex items-center gap-2 rounded-lg border border-line bg-white/5 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <MessageSquare className="size-3.5" />
              <span className="hidden sm:inline">Ir a Chat</span>
            </Link>
          </div>
        </div>

        {/* Alerta de permiso Push bloqueado */}
        {pushPermission === "denied" && (
          <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
            <AlertCircle className="size-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-300">
              <p className="font-semibold">Notificaciones push bloqueadas</p>
              <p className="text-rose-400/70 mt-0.5">
                Ve a la configuración de tu navegador → Privacidad → Notificaciones y permite este sitio.
              </p>
            </div>
          </div>
        )}

        {/* Tarjetas de Métricas Globales */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "Total Leads",
              value: totalStats.total,
              icon: Users,
              cls: "text-white",
            },
            {
              label: "Sin Asignar",
              value: totalStats.unassigned,
              icon: AlertCircle,
              cls: "text-amber-300",
            },
            {
              label: "Esperando",
              value: totalStats.waiting,
              icon: Clock,
              cls: "text-amber-300",
            },
            {
              label: "IA Activa",
              value: totalStats.ai,
              icon: Zap,
              cls: "text-emerald-300",
            },
            {
              label: "Asesor",
              value: totalStats.human,
              icon: Shield,
              cls: "text-sky-300",
            },
            {
              label: "Resueltos",
              value: totalStats.resolved,
              icon: CheckCircle2,
              cls: "text-slate-300",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-line bg-panel/80 p-4 space-y-2"
            >
              <stat.icon className={`size-4 ${stat.cls}`} />
              <p className={`text-2xl font-bold ${stat.cls}`}>{stat.value}</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        {/* Tarjetas de Asesores (Carga de Trabajo) */}
        <div>
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
            Carga por Asesor
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {agentStats.map((stats) => {
              const isSelected = selectedAgentId === stats.agent.id;
              const isUnassigned = stats.agent.id === "unassigned";
              return (
                <button
                  key={stats.agent.id}
                  onClick={() =>
                    setSelectedAgentId(
                      isSelected ? "all" : stats.agent.id
                    )
                  }
                  className={`rounded-xl border p-4 text-left transition space-y-3 ${
                    isSelected
                      ? `${stats.agent.borderClass} ${stats.agent.bgClass} shadow-lg`
                      : "border-line bg-panel/50 hover:bg-panel/80 hover:border-line/80"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`grid size-9 place-items-center rounded-lg text-xs font-bold border ${stats.agent.bgClass} ${stats.agent.textClass} ${stats.agent.borderClass}`}
                      >
                        {stats.agent.avatar}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {stats.agent.name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {stats.agent.role}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-lg font-bold ${stats.agent.textClass}`}
                    >
                      {stats.assignedCount}
                    </span>
                  </div>

                  {/* Mini progreso bars */}
                  <div className="space-y-1.5">
                    {stats.waitingCount > 0 && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-amber-300">Esperando</span>
                        <span className="font-semibold text-amber-300">
                          {stats.waitingCount}
                        </span>
                      </div>
                    )}
                    {stats.activeCount > 0 && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-emerald-300">IA Activa</span>
                        <span className="font-semibold text-emerald-300">
                          {stats.activeCount}
                        </span>
                      </div>
                    )}
                    {stats.resolvedCount > 0 && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Resueltos</span>
                        <span className="font-semibold text-slate-400">
                          {stats.resolvedCount}
                        </span>
                      </div>
                    )}
                    {stats.assignedCount === 0 && (
                      <p className="text-[10px] text-slate-600">
                        {isUnassigned ? "Todos asignados ✓" : "Sin leads"}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <p className="text-[9px] text-slate-400 border-t border-white/10 pt-2">
                      Haz clic para ver todos
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabla de Conversaciones */}
        <div className="rounded-xl border border-line bg-panel/80 overflow-hidden">
          {/* Header de la tabla */}
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white">
                {selectedAgentId === "all"
                  ? "Todas las conversaciones"
                  : `Leads de ${getAgentById(selectedAgentId).name}`}
              </h2>
              <span className="rounded-full border border-line bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {filteredConversations.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Filtros por asesor (pills) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setSelectedAgentId("all")}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    selectedAgentId === "all"
                      ? "bg-signal text-ink font-semibold"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Todos
                </button>
                {CRM_AGENTS.slice(1).map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      selectedAgentId === agent.id
                        ? `${agent.bgClass} ${agent.textClass} border ${agent.borderClass}`
                        : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    {agent.name.split(" ")[0]}
                  </button>
                ))}
              </div>

              {/* Buscador */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar..."
                  className="w-36 rounded-lg border border-line bg-ink/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-signal/50 transition"
                />
              </div>
            </div>
          </div>

          {/* Cuerpo */}
          {loading ? (
            <div className="p-12 text-center">
              <div className="mx-auto size-6 animate-spin rounded-full border-2 border-signal border-t-transparent mb-3" />
              <p className="text-sm text-slate-500">Cargando datos del equipo...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Users className="size-10 mx-auto text-slate-700 mb-3" />
              <p className="text-sm">Sin conversaciones para este filtro</p>
            </div>
          ) : (
            <div className="divide-y divide-line/50">
              {/* Fila encabezado */}
              <div className="hidden sm:grid grid-cols-[1fr_140px_120px_120px_100px] gap-4 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <span>Lead / Contacto</span>
                <span>Asesor Asignado</span>
                <span>Estado</span>
                <span>Último Mensaje</span>
                <span className="text-center">Acción</span>
              </div>

              {filteredConversations.map((conv) => {
                const contactName =
                  conv.contacts?.name || conv.contacts?.phone || "Cliente";
                const assignedAgentId =
                  assignmentsMap[conv.contact_id] || "unassigned";
                const agent = getAgentById(assignedAgentId);
                const initials = contactName.substring(0, 2).toUpperCase();

                return (
                  <div
                    key={conv.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_140px_120px_120px_100px] gap-2 sm:gap-4 px-4 py-3 hover:bg-white/[0.02] transition group items-center"
                  >
                    {/* Lead / Contacto */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold text-white ring-1 ring-white/10">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {contactName}
                        </p>
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          {conv.contacts?.phone}
                        </p>
                        {conv.last_message_preview && (
                          <p className="text-[10px] text-slate-600 truncate mt-0.5 max-w-xs">
                            {conv.last_message_preview}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Asesor Asignado */}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium ${agent.bgClass} ${agent.textClass} ${agent.borderClass}`}
                      >
                        <span className="font-bold">{agent.avatar}</span>
                        <span>{agent.name}</span>
                      </span>
                    </div>

                    {/* Estado */}
                    <div>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${getStatusBadge(
                          conv.status
                        )}`}
                      >
                        {conv.status === "waiting_agent" && (
                          <span className="mr-1 size-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                        )}
                        {getStatusLabel(conv.status)}
                      </span>
                    </div>

                    {/* Último Mensaje */}
                    <div className="text-[11px] text-slate-400">
                      {conv.last_message_at ? formatTime(conv.last_message_at) : "—"}
                    </div>

                    {/* Acción */}
                    <div className="flex justify-start sm:justify-center">
                      <Link
                        href={`/chat?id=${conv.id}`}
                        className="flex items-center gap-1 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 hover:border-signal/30 transition"
                      >
                        <MessageSquare className="size-3" />
                        Abrir
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Info de Push Notifications */}
        {supportsNotifications() && !pushEnabled && pushPermission !== "denied" && (
          <div className="flex items-start gap-3 rounded-xl border border-signal/20 bg-signal/5 p-4">
            <Bell className="size-4 text-signal shrink-0 mt-0.5" />
            <div className="text-xs text-slate-300 flex-1">
              <p className="font-semibold text-signal">
                Activa las notificaciones push para no perderte ningún lead
              </p>
              <p className="text-slate-500 mt-0.5">
                Recibirás alertas instantáneas cuando llegue un mensaje nuevo o un lead esté esperando asesor, incluso con otra pestaña abierta.
              </p>
            </div>
            <button
              onClick={handleTogglePush}
              className="shrink-0 rounded-lg border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/20 transition"
            >
              Activar →
            </button>
          </div>
        )}

        {pushEnabled && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              <span className="font-semibold">Notificaciones push activas.</span>{" "}
              Recibirás alertas en este navegador cuando haya actividad de leads.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
