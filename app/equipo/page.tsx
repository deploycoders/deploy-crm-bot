"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit2,
  ExternalLink,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  CRMAgent,
  getAllAgents,
  saveAgent,
  deleteAgent,
  getAllAssignmentsMap,
  assignLeadAgent,
  getAgentById,
} from "@/lib/agents";
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

// Datos de demostración cuando Supabase está en configuración inicial
const DEMO_EQUIPO_CONVERSATIONS: ConversationData[] = [
  {
    id: "demo-1",
    contact_id: "contact-1",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    last_message_preview: "Hola",
    unread_count: 0,
    contacts: {
      id: "contact-1",
      name: "Ing Jesus Pichardo",
      phone: "+584124811691",
    },
  },
  {
    id: "demo-2",
    contact_id: "contact-2",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    last_message_preview: "Saludos! Un gusto saludarte de nuevo.",
    unread_count: 0,
    contacts: {
      id: "contact-2",
      name: "Mario Gonzalez",
      phone: "+584145614391",
    },
  },
  {
    id: "demo-3",
    contact_id: "contact-3",
    status: "waiting_agent",
    last_message_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    last_message_preview: "Hola! Muy buenos dias. Bienvenido a Deplo...",
    unread_count: 1,
    contacts: {
      id: "contact-3",
      name: "Jose Colmenarez",
      phone: "+555195098805",
    },
  },
  {
    id: "demo-4",
    contact_id: "contact-4",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    last_message_preview: "Hola! Para crear una Card en Kotlin...",
    unread_count: 0,
    contacts: {
      id: "contact-4",
      name: "Jesus Rivero",
      phone: "+584145414202",
    },
  },
  {
    id: "demo-5",
    contact_id: "contact-5",
    status: "waiting_agent",
    last_message_at: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
    last_message_preview: "Lamento el inconveniente con la activacion...",
    unread_count: 2,
    contacts: {
      id: "contact-5",
      name: "Caos Mel",
      phone: "+584125590265",
    },
  },
  {
    id: "demo-6",
    contact_id: "contact-6",
    status: "human_takeover",
    last_message_at: new Date(Date.now() - 120 * 3600 * 1000).toISOString(),
    last_message_preview: "El huesazo",
    unread_count: 0,
    contacts: {
      id: "contact-6",
      name: "Cliente Demo",
      phone: "+584245883315",
    },
  },
  {
    id: "demo-7",
    contact_id: "contact-7",
    status: "resolved",
    last_message_at: new Date(Date.now() - 144 * 3600 * 1000).toISOString(),
    last_message_preview: "Hola, es una prueba",
    unread_count: 0,
    contacts: {
      id: "contact-7",
      name: "Carlos Mendoza",
      phone: "+1234567890",
    },
  },
];

export default function EquipoPage() {
  const [conversations, setConversations] = useState<ConversationData[]>(DEMO_EQUIPO_CONVERSATIONS);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("all");
  const [pushEnabled, setPushEnabledState] = useState(false);
  const [pushPermission, setPushPermission] = useState<
    ReturnType<typeof getNotificationPermission>
  >("unavailable");
  const [refreshing, setRefreshing] = useState(false);

  // Lista dinamica de asesores
  const [teamAgents, setTeamAgents] = useState<CRMAgent[]>([]);

  // Modal para gestionar asesores
  const [showManageModal, setShowManageModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<{ id?: string; name: string; role: string } | null>(null);

  // Mapas de asignaciones de asesores
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string>>({});

  // ID del contacto cuyo menu dropdown de asignacion esta abierto
  const [activePickerContactId, setActivePickerContactId] = useState<string | null>(null);

  // Toast flotante de confirmacion de asignacion o gestion
  const [assignmentToast, setAssignmentToast] = useState<{
    contactName: string;
    agentName: string;
    agentColor: string;
    isUnassigned: boolean;
  } | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const reloadAgents = () => {
    setTeamAgents(getAllAgents());
  };

  const fetchData = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false });

      if (!error && data && data.length > 0) {
        setConversations(data as ConversationData[]);
      }
    } catch {
      // Usar lista demo
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    reloadAgents();
    setAssignmentsMap(getAllAssignmentsMap());

    // Estado de notificaciones push
    setPushPermission(getNotificationPermission());
    setPushEnabledState(isPushEnabled());

    // Escuchar eventos de cambio de asignacion entre pestanas y componentes
    const handleAssignmentChange = () => {
      setAssignmentsMap(getAllAssignmentsMap());
    };
    const handleAgentsUpdated = () => {
      reloadAgents();
      setAssignmentsMap(getAllAssignmentsMap());
    };

    window.addEventListener("crm:assignment-change", handleAssignmentChange);
    window.addEventListener("crm:agents-updated", handleAgentsUpdated);

    // Actualizaciones en tiempo real con Supabase
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
      window.removeEventListener("crm:assignment-change", handleAssignmentChange);
      window.removeEventListener("crm:agents-updated", handleAgentsUpdated);
      supabase.removeChannel(channel);
    };
  }, []);

  // Handlers para crear, editar o eliminar asesores
  const handleSaveAgentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAgent || !editingAgent.name.trim()) return;

    const saved = saveAgent({
      id: editingAgent.id,
      name: editingAgent.name,
      role: editingAgent.role || "Asesor",
    });

    setEditingAgent(null);
    reloadAgents();

    setAssignmentToast({
      contactName: saved.name,
      agentName: saved.role,
      agentColor: saved.color,
      isUnassigned: false,
    });
    setTimeout(() => setAssignmentToast(null), 3000);
  };

  const handleDeleteAgent = (agentId: string, agentName: string) => {
    if (confirm(`Esta seguro de eliminar a ${agentName}? Sus chats asignados pasaran a Sin asignar.`)) {
      deleteAgent(agentId);
      reloadAgents();
      if (selectedAgentId === agentId) {
        setSelectedAgentId("all");
      }
    }
  };

  // Cerrar selector al hacer clic fuera
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-agent-picker]")) {
        setActivePickerContactId(null);
      }
    };

    if (activePickerContactId) {
      document.addEventListener("mousedown", handleDocumentClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [activePickerContactId]);

  // Asignar asesor a un lead / chat
  const handleAssignAgentToContact = (
    contactId: string,
    agentId: string,
    contactName: string
  ) => {
    assignLeadAgent(contactId, agentId);
    setAssignmentsMap((prev) => {
      const updated = { ...prev };
      if (agentId === "unassigned") {
        delete updated[contactId];
      } else {
        updated[contactId] = agentId;
      }
      return updated;
    });

    setActivePickerContactId(null);

    const agent = getAgentById(agentId);
    setAssignmentToast({
      contactName,
      agentName: agent.name,
      agentColor: agent.color,
      isUnassigned: agentId === "unassigned",
    });

    setTimeout(() => {
      setAssignmentToast(null);
    }, 3500);
  };

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

  // Construir estadisticas en tiempo real por asesor
  const agentStats = useMemo((): AgentStats[] => {
    const list = teamAgents.length > 0 ? teamAgents : getAllAgents();
    return list.map((agent) => {
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
        waitingCount: assigned.filter((c) => c.status === "waiting_agent").length,
        activeCount: assigned.filter((c) => c.status === "ai_active").length,
        resolvedCount: assigned.filter((c) => c.status === "resolved").length,
        conversations: assigned,
      };
    });
  }, [conversations, assignmentsMap, teamAgents]);

  // Estadisticas globales
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

  // Conversaciones filtradas por asesor y termino de busqueda
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

  const currentAgents = teamAgents.length > 0 ? teamAgents : getAllAgents();

  return (
    <div className="min-h-screen bg-ink p-4 md:p-6 lg:p-8 relative">

      {/* Toast Flotante de Asignacion Exitosa */}
      {assignmentToast && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-line bg-panel/95 p-3.5 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-3 duration-200">
          <div
            className="grid size-8 place-items-center rounded-lg text-xs font-bold"
            style={{
              backgroundColor: `${assignmentToast.agentColor}20`,
              color: assignmentToast.agentColor,
            }}
          >
            <UserCheck className="size-4" />
          </div>
          <div className="text-xs">
            <p className="font-semibold text-white">
              {assignmentToast.isUnassigned ? "Asignacion eliminada" : "Asesor Asignado"}
            </p>
            <p className="text-slate-400 mt-0.5">
              <strong className="text-slate-200">{assignmentToast.contactName}</strong>{" "}
              {assignmentToast.isUnassigned
                ? "ha quedado sin asesor asignado"
                : `ahora es atendido por ${assignmentToast.agentName}`}
            </p>
          </div>
          <button
            onClick={() => setAssignmentToast(null)}
            className="text-slate-500 hover:text-white text-xs ml-2"
          >
            x
          </button>
        </div>
      )}

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
              Supervision de carga, distribucion de leads y asignacion del asesor que atiende cada chat
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Boton Gestionar Asesores */}
            <button
              onClick={() => {
                setEditingAgent(null);
                setShowManageModal(true);
              }}
              className="flex items-center gap-2 rounded-lg border border-signal/40 bg-signal/10 px-3.5 py-2 text-xs font-semibold text-signal hover:bg-signal/20 transition cursor-pointer shadow-sm active:scale-95"
            >
              <UserPlus className="size-3.5" />
              <span>Gestionar Asesores</span>
            </button>

            {/* Boton Notificaciones Push */}
            <button
              onClick={handleTogglePush}
              disabled={!supportsNotifications() || pushPermission === "denied"}
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
              {pushEnabled ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}
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
              <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
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
                Ve a la configuracion de tu navegador, Privacidad, Notificaciones y permite este sitio.
              </p>
            </div>
          </div>
        )}

        {/* Tarjetas de Metricas Globales */}
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Carga por Asesor
            </h2>
            <span className="text-xs text-slate-400">
              Haz clic en una tarjeta para filtrar los leads asignados
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {agentStats.map((stats) => {
              const isSelected = selectedAgentId === stats.agent.id;
              const isUnassigned = stats.agent.id === "unassigned";
              return (
                <button
                  key={stats.agent.id}
                  onClick={() =>
                    setSelectedAgentId(isSelected ? "all" : stats.agent.id)
                  }
                  className={`rounded-xl border p-4 text-left transition space-y-3 cursor-pointer ${
                    isSelected
                      ? `${stats.agent.borderClass} ${stats.agent.bgClass} shadow-lg ring-1 ring-primary/40`
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
                    <span className={`text-lg font-bold ${stats.agent.textClass}`}>
                      {stats.assignedCount}
                    </span>
                  </div>

                  {/* Mini desglose de estados */}
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
                        {isUnassigned ? "Todos asignados" : "Sin leads asignados"}
                      </p>
                    )}
                  </div>

                  {isSelected && (
                    <p className="text-[9px] text-slate-400 border-t border-white/10 pt-2 font-medium">
                      Filtrando leads de este asesor (clic para ver todos)
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tabla de Conversaciones con Asignacion de Asesor */}
        <div
          ref={tableContainerRef}
          className="rounded-xl border border-line bg-panel/80 overflow-visible"
        >
          {/* Header de la tabla */}
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold text-white">
                {selectedAgentId === "all"
                  ? "Todas las conversaciones"
                  : selectedAgentId === "unassigned"
                  ? "Leads Sin Asignar"
                  : `Leads atendidos por ${getAgentById(selectedAgentId).name}`}
              </h2>
              <span className="rounded-full border border-line bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-400">
                {filteredConversations.length}
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filtros por asesor (pills) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setSelectedAgentId("all")}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                    selectedAgentId === "all"
                      ? "bg-signal text-ink font-semibold"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  Todos
                </button>
                {currentAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => setSelectedAgentId(agent.id)}
                    className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                      selectedAgentId === agent.id
                        ? `${agent.bgClass} ${agent.textClass} border ${agent.borderClass} font-semibold`
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
                  placeholder="Buscar lead o mensaje..."
                  className="w-40 sm:w-48 rounded-lg border border-line bg-ink/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-signal/50 transition"
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
              <p className="text-sm font-medium">Sin conversaciones para este filtro</p>
              {selectedAgentId !== "all" && (
                <button
                  onClick={() => setSelectedAgentId("all")}
                  className="mt-2 text-xs text-signal hover:underline"
                >
                  Ver todas las conversaciones
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-line/50">
              {/* Fila encabezado */}
              <div className="hidden sm:grid grid-cols-[1fr_170px_110px_110px_100px] gap-4 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 bg-white/[0.01]">
                <span>Lead / Contacto</span>
                <span>Asesor Asignado (Asignar)</span>
                <span>Estado</span>
                <span>Ultimo Mensaje</span>
                <span className="text-center">Accion</span>
              </div>

              {filteredConversations.map((conv) => {
                const contactName = conv.contacts?.name || conv.contacts?.phone || "Cliente";
                const assignedAgentId = assignmentsMap[conv.contact_id] || "unassigned";
                const agent = getAgentById(assignedAgentId);
                const initials = contactName.substring(0, 2).toUpperCase();
                const isPickerOpen = activePickerContactId === conv.contact_id;

                return (
                  <div
                    key={conv.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_170px_110px_110px_100px] gap-3 sm:gap-4 px-4 py-3 hover:bg-white/[0.02] transition items-center"
                  >
                    {/* Lead / Contacto */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-bold text-white ring-1 ring-white/10">
                        {initials}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-white truncate">
                            {contactName}
                          </p>
                          {/* Badge de estado en mobile */}
                          <span
                            className={`sm:hidden inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium ${getStatusBadge(
                              conv.status
                            )}`}
                          >
                            {conv.status === "waiting_agent" && (
                              <span className="mr-1 size-1.5 rounded-full bg-amber-400 animate-pulse inline-block" />
                            )}
                            {getStatusLabel(conv.status)}
                          </span>
                        </div>
                        <p className="text-[10px] font-mono text-slate-500 truncate">
                          {conv.contacts?.phone}
                        </p>
                        {conv.last_message_preview && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5 max-w-sm">
                            {conv.last_message_preview}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Asesor Asignado (SELECTOR INTERACTIVO) */}
                    <div className="relative" data-agent-picker>
                      <div className="sm:hidden text-[10px] uppercase font-bold text-slate-500 mb-1">
                        Asesor que atiende:
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActivePickerContactId(isPickerOpen ? null : conv.contact_id);
                        }}
                        className={`inline-flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition cursor-pointer w-full sm:w-auto hover:brightness-110 active:scale-95 ${agent.bgClass} ${agent.textClass} ${agent.borderClass} ${
                          assignedAgentId === "unassigned"
                            ? "border-dashed hover:border-solid hover:bg-white/10"
                            : "shadow-sm"
                        }`}
                        title="Haz clic para asignar o cambiar el asesor"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="font-bold text-[11px] shrink-0">{agent.avatar}</span>
                          <span className="truncate max-w-[95px] font-semibold">{agent.name}</span>
                        </div>
                        <ChevronDown className="size-3.5 opacity-60 shrink-0 ml-1" />
                      </button>

                      {/* Dropdown flotante con selector de asesores */}
                      {isPickerOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-50 w-64 rounded-xl border border-line bg-panel p-2 shadow-2xl backdrop-blur-2xl ring-1 ring-white/10"
                        >
                          <div className="px-2 py-1.5 border-b border-line/60 mb-1.5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <UserPlus className="size-3.5 text-signal" />
                              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                                Asignar a {contactName.split(" ")[0]}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setActivePickerContactId(null)}
                              className="text-slate-500 hover:text-white text-xs p-0.5"
                            >
                              x
                            </button>
                          </div>

                          <div className="space-y-1">
                            {currentAgents.map((a) => {
                              const isCurrent = assignedAgentId === a.id;
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() =>
                                    handleAssignAgentToContact(
                                      conv.contact_id,
                                      a.id,
                                      contactName
                                    )
                                  }
                                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition text-left cursor-pointer ${
                                    isCurrent
                                      ? `${a.bgClass} ${a.textClass} font-semibold border ${a.borderClass}`
                                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className={`grid size-6 place-items-center rounded text-[10px] font-bold ${a.bgClass} ${a.textClass} border ${a.borderClass}`}
                                    >
                                      {a.avatar}
                                    </span>
                                    <div className="truncate">
                                      <p className="truncate font-semibold">{a.name}</p>
                                      {a.role !== "-" && (
                                        <p className="text-[9px] text-slate-500 truncate">
                                          {a.role}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  {isCurrent && (
                                    <Check className="size-3.5 text-signal shrink-0 ml-1.5" />
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Estado en desktop */}
                    <div className="hidden sm:block">
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

                    {/* Ultimo Mensaje */}
                    <div className="text-[11px] text-slate-400">
                      {conv.last_message_at ? formatTime(conv.last_message_at) : "-"}
                    </div>

                    {/* Accion */}
                    <div className="flex justify-start sm:justify-center">
                      <Link
                        href={`/chat?id=${conv.id}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 hover:border-signal/30 transition w-full sm:w-auto justify-center"
                      >
                        <MessageSquare className="size-3 text-signal" />
                        Abrir Chat
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
                Activa las notificaciones push para no perderte ningun lead
              </p>
              <p className="text-slate-500 mt-0.5">
                Recibiras alertas instantaneas cuando llegue un mensaje nuevo o un lead este esperando asesor, incluso con otra pestana abierta.
              </p>
            </div>
            <button
              onClick={handleTogglePush}
              className="shrink-0 rounded-lg border border-signal/40 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/20 transition cursor-pointer"
            >
              Activar
            </button>
          </div>
        )}

        {pushEnabled && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 className="size-4 text-emerald-400 shrink-0" />
            <p className="text-xs text-emerald-300">
              <span className="font-semibold">Notificaciones push activas.</span>{" "}
              Recibiras alertas en este navegador cuando haya actividad de leads.
            </p>
          </div>
        )}

      </div>

      {/* Modal para Gestionar Asesores (fuera del max-w-7xl pero dentro del root) */}
      {showManageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => { setShowManageModal(false); setEditingAgent(null); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl border border-line bg-panel p-6 shadow-2xl relative space-y-5"
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg bg-signal/15 text-signal border border-signal/30 font-bold">
                  <Users className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Gestionar Equipo de Asesores</h3>
                  <p className="text-xs text-slate-400">Agrega, edita o elimina los asesores que atienden el CRM</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setEditingAgent(null);
                }}
                className="size-8 rounded-lg border border-line bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
              >
                x
              </button>
            </div>

            {/* Formulario para agregar / editar asesor */}
            <form onSubmit={handleSaveAgentSubmit} className="rounded-xl border border-line/80 bg-ink/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-signal">
                  {editingAgent?.id ? "Editar Asesor" : "Nuevo Asesor"}
                </span>
                {editingAgent && (
                  <button
                    type="button"
                    onClick={() => setEditingAgent(null)}
                    className="text-[11px] text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Cancelar edicion
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Nombre del Asesor
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAgent?.name ?? ""}
                    onChange={(e) =>
                      setEditingAgent((prev) => ({
                        id: prev?.id,
                        name: e.target.value,
                        role: prev?.role ?? "",
                      }))
                    }
                    placeholder="Ej. Roberto Diaz"
                    className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-signal/60 transition"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                    Cargo / Rol
                  </label>
                  <input
                    type="text"
                    required
                    value={editingAgent?.role ?? ""}
                    onChange={(e) =>
                      setEditingAgent((prev) => ({
                        id: prev?.id,
                        name: prev?.name ?? "",
                        role: e.target.value,
                      }))
                    }
                    placeholder="Ej. Ventas Inmobiliarias"
                    className="w-full rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-white placeholder:text-slate-600 outline-none focus:border-signal/60 transition"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-signal text-ink px-3.5 py-1.5 text-xs font-bold hover:brightness-110 active:scale-95 transition cursor-pointer shadow-sm"
                >
                  <Plus className="size-3.5" />
                  <span>{editingAgent?.id ? "Guardar Cambios" : "Agregar Asesor"}</span>
                </button>
              </div>
            </form>

            {/* Lista de Asesores Actuales */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                Asesores Registrados ({currentAgents.filter((a) => a.id !== "unassigned").length})
              </span>

              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {currentAgents
                  .filter((a) => a.id !== "unassigned")
                  .map((agent) => (
                    <div
                      key={agent.id}
                      className="flex items-center justify-between rounded-xl border border-line/60 bg-ink/40 p-2.5 transition hover:bg-ink/70"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`grid size-8 place-items-center rounded-lg text-xs font-bold ${agent.bgClass} ${agent.textClass} border ${agent.borderClass}`}
                        >
                          {agent.avatar}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{agent.name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{agent.role}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingAgent({
                              id: agent.id,
                              name: agent.name,
                              role: agent.role,
                            })
                          }
                          className="size-7 rounded-lg border border-line/60 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer"
                          title="Editar asesor"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(agent.id, agent.name)}
                          className="size-7 rounded-lg border border-line/60 bg-white/5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center transition cursor-pointer"
                          title="Eliminar asesor"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {/* Footer del Modal */}
            <div className="flex items-center justify-between border-t border-line pt-3 text-[11px] text-slate-400">
              <span>Los cambios se guardan y sincronizan inmediatamente con el chat.</span>
              <button
                type="button"
                onClick={() => {
                  setShowManageModal(false);
                  setEditingAgent(null);
                }}
                className="rounded-lg border border-line bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
