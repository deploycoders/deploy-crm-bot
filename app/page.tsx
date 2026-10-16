"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  MessageCircle,
  MessageSquare,
  Sparkles,
  TrendingUp,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

interface ConversationItem {
  id: string;
  contact_id: string;
  channel: string;
  status: "ai_active" | "human_takeover" | "waiting_agent" | "resolved";
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  contacts?: Contact;
}

interface DashboardStats {
  totalConversations: number;
  aiActive: number;
  waitingAgent: number;
  humanTakeover: number;
  totalContacts: number;
  totalMessages: number;
}

export default function DashboardPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    totalConversations: 0,
    aiActive: 0,
    waitingAgent: 0,
    humanTakeover: 0,
    totalContacts: 0,
    totalMessages: 0,
  });
  const [loading, setLoading] = useState(true);

  // Cargar datos reales de Supabase
  const loadDashboardData = async () => {
    try {
      // 1. Cargar conversaciones reales con contactos
      const { data: convData, error: convError } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false });

      if (convError) throw convError;

      const items = (convData || []) as ConversationItem[];
      setConversations(items);

      // 2. Conteo de contactos
      const { count: contactsCount } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true });

      // 3. Conteo de mensajes
      const { count: messagesCount } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true });

      // 4. Calcular métricas reales
      const aiActive = items.filter((c) => c.status === "ai_active").length;
      const waitingAgent = items.filter((c) => c.status === "waiting_agent").length;
      const humanTakeover = items.filter((c) => c.status === "human_takeover").length;

      setStats({
        totalConversations: items.length,
        aiActive,
        waitingAgent,
        humanTakeover,
        totalContacts: contactsCount || 0,
        totalMessages: messagesCount || 0,
      });
    } catch (err) {
      console.error("Error al cargar datos del dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

    // Suscripción en tiempo real para mantener el Dashboard actualizado
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          loadDashboardData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const getStatusBadge = (status: ConversationItem["status"]) => {
    switch (status) {
      case "ai_active":
        return {
          label: "Atendido por IA",
          pill: "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20",
          icon: Bot,
        };
      case "waiting_agent":
        return {
          label: "Esperando Asesor",
          pill: "bg-amber-400/10 text-amber-300 border border-amber-400/20",
          icon: Clock,
        };
      case "human_takeover":
        return {
          label: "Asesor Humano",
          pill: "bg-sky-400/10 text-sky-300 border border-sky-400/20",
          icon: UserCheck,
        };
      default:
        return {
          label: status,
          pill: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
          icon: CheckCircle2,
        };
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "Reciente";
    const date = new Date(dateString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Tasa de contención automática de la IA
  const automationRate =
    stats.totalConversations > 0
      ? Math.round((stats.aiActive / stats.totalConversations) * 100)
      : 100;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-signal animate-pulse" />
            <p className="text-xs font-semibold tracking-wider uppercase text-signal">
              Datos en Vivo • Deploy Cockpit
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Dashboard de Operaciones
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Métricas reales de WhatsApp, estado de leads y supervisión del chatbot en tiempo real.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-signal/30 bg-signal px-4 py-2 text-sm font-semibold text-ink shadow-glow transition hover:bg-emerald-300"
          >
            Abrir Bandeja en Vivo
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </header>

      {/* Grid de Métricas Reales */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Conversaciones Totales */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl transition hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Conversaciones
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {loading ? "..." : stats.totalConversations}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-signal/10 text-signal border border-signal/20">
              <MessageSquare className="size-5" />
            </span>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="text-signal font-semibold">{stats.totalMessages}</span>
            <span>mensajes intercambiados</span>
          </p>
        </article>

        {/* Atendidos por IA */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl transition hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Atendidos por IA
              </p>
              <p className="mt-2 text-3xl font-bold text-signal">
                {loading ? "..." : stats.aiActive}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-signal/10 text-signal border border-signal/20">
              <Bot className="size-5" />
            </span>
          </div>
          <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
            <Sparkles className="size-3.5 text-signal" />
            <span>{automationRate}% tasa de automatización</span>
          </p>
        </article>

        {/* Leads Esperando Asesor */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl transition hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Esperando Asesor
              </p>
              <p
                className={`mt-2 text-3xl font-bold ${
                  stats.waitingAgent > 0 ? "text-amber-300" : "text-white"
                }`}
              >
                {loading ? "..." : stats.waitingAgent}
              </p>
            </div>
            <span
              className={`grid size-11 place-items-center rounded-xl border ${
                stats.waitingAgent > 0
                  ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                  : "bg-white/5 text-slate-400 border-line"
              }`}
            >
              <Clock className="size-5" />
            </span>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            {stats.waitingAgent === 1
              ? "1 prospecto solicita humano"
              : `${stats.waitingAgent} prospectos solicitan humano`}
          </p>
        </article>

        {/* Contactos Registrados */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl transition hover:border-slate-700">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                Contactos Totales
              </p>
              <p className="mt-2 text-3xl font-bold text-white">
                {loading ? "..." : stats.totalContacts}
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-xl bg-white/5 text-slate-300 border border-line">
              <UsersRound className="size-5" />
            </span>
          </div>
          <p className="mt-4 text-xs text-slate-400">
            Directorio sincronizado de WhatsApp
          </p>
        </article>
      </section>

      {/* Contenido Principal: Conversaciones Recientes Reales */}
      <section className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* Tabla en Vivo */}
        <div className="overflow-hidden rounded-xl border border-line bg-panel/70 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Conversaciones Recientes de WhatsApp
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Historial sincronizado desde Meta Cloud API y Supabase.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-signal/20 bg-signal/5 px-2.5 py-1 text-xs font-medium text-signal">
              <span className="size-1.5 rounded-full bg-signal animate-ping" />
              Sincronizado
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400 border-b border-line">
                <tr>
                  <th className="px-5 py-3 font-medium">Contacto</th>
                  <th className="px-5 py-3 font-medium">Último Mensaje</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 font-medium">Fecha</th>
                  <th className="px-5 py-3 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {conversations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                      {loading ? "Cargando conversaciones..." : "No hay conversaciones registradas aún."}
                    </td>
                  </tr>
                ) : (
                  conversations.map((conv) => {
                    const badge = getStatusBadge(conv.status);
                    const contactName = conv.contacts?.name || "Cliente WhatsApp";
                    const contactPhone = conv.contacts?.phone || "Sin número";

                    return (
                      <tr key={conv.id} className="hover:bg-white/[0.03] transition">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <span className="grid size-9 place-items-center rounded-lg bg-white/5 border border-line text-xs font-bold text-slate-200 uppercase">
                              {contactName.substring(0, 2)}
                            </span>
                            <div>
                              <p className="font-medium text-white">{contactName}</p>
                              <p className="text-xs text-slate-400">{contactPhone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 max-w-xs">
                          <p className="truncate text-xs text-slate-300">
                            {conv.last_message_preview || "Sin mensajes"}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${badge.pill}`}
                          >
                            <badge.icon className="size-3.5" />
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                          {formatDate(conv.last_message_at)}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/chat?id=${conv.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-signal/40 hover:bg-signal/10 hover:text-signal"
                          >
                            Abrir Chat
                            <ArrowRight className="size-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel Lateral de Estado Operativo */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Distribución de Leads
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Desglose de la carga de trabajo actual del CRM.
            </p>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="size-2 rounded-full bg-signal" />
                  Atención IA Autónoma
                </span>
                <span className="font-bold text-white">{stats.aiActive}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-signal transition-all duration-500"
                  style={{
                    width: `${stats.totalConversations > 0 ? (stats.aiActive / stats.totalConversations) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-2">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="size-2 rounded-full bg-amber-400" />
                  Esperando Asesor Humano
                </span>
                <span className="font-bold text-white">{stats.waitingAgent}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-amber-400 transition-all duration-500"
                  style={{
                    width: `${stats.totalConversations > 0 ? (stats.waitingAgent / stats.totalConversations) * 100 : 0}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-2">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="size-2 rounded-full bg-sky-400" />
                  Intervención Humana
                </span>
                <span className="font-bold text-white">{stats.humanTakeover}</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-500"
                  style={{
                    width: `${stats.totalConversations > 0 ? (stats.humanTakeover / stats.totalConversations) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Accesos Rápidos
            </h3>
            <div className="mt-3 space-y-2">
              <Link
                href="/contactos"
                className="flex items-center justify-between rounded-lg border border-line bg-white/5 p-3 text-xs text-slate-300 hover:border-slate-600 hover:bg-white/10 transition"
              >
                <span>Ver Directorio de Contactos</span>
                <UsersRound className="size-4 text-slate-400" />
              </Link>
              <Link
                href="/configuracion"
                className="flex items-center justify-between rounded-lg border border-line bg-white/5 p-3 text-xs text-slate-300 hover:border-slate-600 hover:bg-white/10 transition"
              >
                <span>Estado de Servicios y Prompts</span>
                <Sparkles className="size-4 text-signal" />
              </Link>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
