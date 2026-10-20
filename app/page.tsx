"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface ConversationRow {
  id: string;
  name: string;
  phone: string;
  initials: string;
  avatarColor: "primary" | "secondary" | "tertiary" | "outline";
  lastMessage: string;
  status: "ai_active" | "waiting_agent" | "human_takeover" | "resolved";
  date: string;
  time: string;
}

// Detecta si las keys de Supabase son placeholders
const isSupabaseMisconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder");

export default function DashboardPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [totalContacts, setTotalContacts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "ai" | "waiting" | "human">("all");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [lastSync, setLastSync] = useState<Date>(new Date());

  const colors: ("primary" | "secondary" | "tertiary" | "outline")[] = [
    "primary",
    "secondary",
    "tertiary",
    "outline",
  ];

  const loadData = useCallback(async () => {
    try {
      // Cargar conversaciones con datos del contacto
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (error) {
        console.error("Error al cargar conversaciones:", error.message);
        return;
      }

      if (data) {
        const mapped: ConversationRow[] = data.map((c: any, index: number) => {
          const name =
            c.contacts?.name ||
            c.contacts?.phone ||
            "Cliente WhatsApp";
          const phone = c.contacts?.phone || "";
          const dateObj = new Date(c.last_message_at || Date.now());

          return {
            id: c.id,
            name,
            phone,
            initials: name.slice(0, 2).toUpperCase(),
            avatarColor: colors[index % colors.length],
            lastMessage: c.last_message_preview || "Sin mensajes recientes",
            status: c.status || "ai_active",
            date: dateObj.toLocaleDateString("es-ES", {
              day: "2-digit",
              month: "short",
            }),
            time: dateObj.toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
          };
        });
        setConversations(mapped);
        setLastSync(new Date());
      }

      // Cargar conteo total de contactos
      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true });
      if (count !== null) setTotalContacts(count);
    } catch (err) {
      console.error("Error al conectar con Supabase:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSupabaseMisconfigured) {
      setLoading(false);
      return;
    }
    loadData();
  }, [loadData]);

  // Suscripción realtime
  useEffect(() => {
    if (isSupabaseMisconfigured) return;

    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // Filtrado reactivo
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.lastMessage.toLowerCase().includes(q);

      let matchesFilter = true;
      if (activeFilter === "ai") matchesFilter = c.status === "ai_active";
      if (activeFilter === "waiting") matchesFilter = c.status === "waiting_agent";
      if (activeFilter === "human") matchesFilter = c.status === "human_takeover";

      return matchesSearch && matchesFilter;
    });
  }, [conversations, searchQuery, activeFilter]);

  // Métricas calculadas desde datos reales
  const totalConvs = conversations.length;
  const aiCount = conversations.filter((c) => c.status === "ai_active").length;
  const waitingCount = conversations.filter((c) => c.status === "waiting_agent").length;
  const humanCount = conversations.filter((c) => c.status === "human_takeover").length;

  const aiPercentage = totalConvs > 0 ? Math.round((aiCount / totalConvs) * 100) : 0;
  const waitingPercentage = totalConvs > 0 ? Math.round((waitingCount / totalConvs) * 100) : 0;
  const humanPercentage = totalConvs > 0 ? Math.round((humanCount / totalConvs) * 100) : 0;

  const formatSyncTime = () => {
    return lastSync.toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  };

  const getStatusBadge = (status: ConversationRow["status"]) => {
    switch (status) {
      case "ai_active":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[11px] font-semibold border border-primary/20">
            <span className="material-symbols-outlined text-[14px]">smart_toy</span>
            IA Activa
          </span>
        );
      case "waiting_agent":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-400/10 text-amber-300 text-[11px] font-semibold border border-amber-400/20">
            <span className="material-symbols-outlined text-[14px]">hourglass_empty</span>
            Esperando Asesor
          </span>
        );
      case "human_takeover":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-400/10 text-sky-300 text-[11px] font-semibold border border-sky-400/20">
            <span className="material-symbols-outlined text-[14px]">person</span>
            Asesor Activo
          </span>
        );
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-400/10 text-slate-400 text-[11px] font-semibold border border-slate-400/20">
            <span className="material-symbols-outlined text-[14px]">check_circle</span>
            Resuelto
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col w-full p-6 space-y-6">

      {/* Banner de advertencia si Supabase no está configurado */}
      {isSupabaseMisconfigured && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-400/40 bg-amber-400/10">
          <span className="material-symbols-outlined text-amber-300 text-[20px] mt-0.5 shrink-0">warning</span>
          <div>
            <p className="text-sm font-semibold text-amber-200">Supabase no configurado</p>
            <p className="text-xs text-amber-300/80 mt-0.5">
              Actualiza <code className="bg-amber-400/20 px-1 rounded">.env.local</code> con tus credenciales reales de Supabase para ver la data en vivo.
              Las variables <code className="bg-amber-400/20 px-1 rounded">NEXT_PUBLIC_SUPABASE_URL</code> y{" "}
              <code className="bg-amber-400/20 px-1 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> son requeridas.
            </p>
          </div>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high/60 border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              <span className="text-[11px] font-bold uppercase text-primary tracking-wider">
                {isSupabaseMisconfigured ? "Sin Conexión" : "Datos en Vivo"}
              </span>
            </div>
            {!isSupabaseMisconfigured && (
              <>
                <span className="w-1 h-1 rounded-full bg-outline-variant"></span>
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px] text-outline">sync</span>
                  <span>
                    Última sync:{" "}
                    <span className="text-on-surface font-semibold">{formatSyncTime()}</span>
                  </span>
                </div>
              </>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-on-surface tracking-tight">
            Dashboard de Operaciones
          </h1>
          <p className="text-sm text-on-surface-variant max-w-2xl">
            Métricas en tiempo real del chatbot de WhatsApp y supervisión de conversaciones.
          </p>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 flex-wrap self-start xl:self-center">
          {/* Filtros Rápidos */}
          <div className="relative">
            <button
              onClick={() => setShowFilterMenu(!showFilterMenu)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-surface-container text-on-surface hover:bg-surface-container-high border border-surface-container-high/50 transition-colors text-sm font-semibold cursor-pointer"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px] text-outline">filter_list</span>
              <span>Filtrar</span>
              {activeFilter !== "all" && (
                <span className="w-2 h-2 rounded-full bg-primary"></span>
              )}
            </button>

            {showFilterMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-surface-container rounded-xl border border-surface-container-high p-1.5 shadow-xl z-50 space-y-1">
                {[
                  { key: "all", label: "Todos", count: totalConvs },
                  { key: "ai", label: "IA Activa", count: aiCount },
                  { key: "waiting", label: "Esperando Asesor", count: waitingCount },
                  { key: "human", label: "Asesor Activo", count: humanCount },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setActiveFilter(f.key as typeof activeFilter);
                      setShowFilterMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between ${
                      activeFilter === f.key
                        ? "bg-primary/10 text-primary"
                        : "text-on-surface hover:bg-surface-container-high"
                    }`}
                  >
                    <span>{f.label}</span>
                    <span>{f.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Ir a Mensajes */}
          <Link
            href="/chat"
            className="group flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-on-primary hover:bg-secondary text-sm font-semibold transition-all shadow-sm active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform">
              forum
            </span>
            <span>Ir a Mensajes</span>
            <span className="material-symbols-outlined text-[16px] transition-transform group-hover:translate-x-0.5">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Conversaciones Totales */}
        <div className="bg-surface-container-low rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-outline tracking-wider block">
                Conversaciones
              </span>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <span className="text-3xl font-bold text-on-surface tracking-tight">—</span>
                ) : (
                  <span className="text-3xl font-bold text-on-surface tracking-tight">
                    {totalConvs}
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary group-hover:scale-105 transition-transform border border-primary/20">
              <span className="material-symbols-outlined text-[20px]">chat_bubble</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant text-xs border-t border-surface-container-high/40">
            <span className="flex items-center gap-1.5 text-on-surface">
              <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
              En tiempo real
            </span>
            <span className="text-outline">Supabase RT</span>
          </div>
        </div>

        {/* Card 2: Atendidos por IA */}
        <div className="bg-surface-container-low rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-outline tracking-wider block">
                Atendidos por IA
              </span>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <span className="text-3xl font-bold text-primary tracking-tight">—</span>
                ) : (
                  <span className="text-3xl font-bold text-primary tracking-tight">
                    {aiCount}
                  </span>
                )}
                {!loading && totalConvs > 0 && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-wide border border-primary/20">
                    {aiPercentage}%
                  </span>
                )}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-105 transition-transform border border-primary/20">
              <span className="material-symbols-outlined text-[20px]">smart_toy</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant text-xs border-t border-surface-container-high/40">
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
              Tasa de automatización
            </span>
          </div>
        </div>

        {/* Card 3: Esperando Asesor */}
        <div className="bg-surface-container-low rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-outline tracking-wider block">
                Esperando Asesor
              </span>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <span className="text-3xl font-bold text-on-surface tracking-tight">—</span>
                ) : (
                  <span
                    className={`text-3xl font-bold tracking-tight ${
                      waitingCount > 0 ? "text-amber-300" : "text-on-surface"
                    }`}
                  >
                    {waitingCount}
                  </span>
                )}
                {!loading && (
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                    {waitingCount === 0 ? "Óptimo" : "Pendiente"}
                  </span>
                )}
              </div>
            </div>
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform ${
                waitingCount > 0
                  ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                  : "bg-surface-container-high text-outline"
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">hourglass_empty</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant text-xs border-t border-surface-container-high/40">
            <span className="text-on-surface-variant">En cola de handoff</span>
          </div>
        </div>

        {/* Card 4: Contactos Totales */}
        <div className="bg-surface-container-low rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-container-high/40">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[11px] font-bold uppercase text-outline tracking-wider block">
                Contactos Totales
              </span>
              <div className="flex items-baseline gap-2">
                {loading ? (
                  <span className="text-3xl font-bold text-on-surface tracking-tight">—</span>
                ) : (
                  <span className="text-3xl font-bold text-on-surface tracking-tight">
                    {totalContacts}
                  </span>
                )}
                <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                  <span className="material-symbols-outlined text-[14px]">done_all</span>
                  Sync
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-[20px]">contacts</span>
            </div>
          </div>
          <div className="mt-4 pt-3 flex items-center justify-between text-on-surface-variant text-xs border-t border-surface-container-high/40">
            <span className="text-outline truncate">Base de datos Supabase</span>
          </div>
        </div>
      </div>

      {/* Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Tabla de Conversaciones Recientes */}
        <section className="lg:col-span-8 bg-surface-container-low rounded-xl shadow-sm flex flex-col overflow-hidden border border-surface-container-high/50">
          {/* Header de la tabla */}
          <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-container-high/40">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-on-surface">
                  Conversaciones Recientes
                </h2>
                {!loading && !isSupabaseMisconfigured && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[11px] font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                    En vivo
                  </span>
                )}
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                WhatsApp Cloud API · Supabase Realtime
              </p>
            </div>

            {/* Input de Búsqueda */}
            <div className="relative min-w-[240px]">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-outline">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar contacto o mensaje..."
                className="w-full pl-8 pr-3 py-1.5 bg-surface-container-high rounded-lg text-on-surface placeholder:text-outline text-xs focus:outline-none focus:ring-1 focus:ring-primary border border-transparent focus:border-primary/40 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tabla de datos */}
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container-high/60 text-outline uppercase text-[11px] font-bold tracking-wider">
                <tr>
                  <th className="py-3 px-4 font-semibold" scope="col">Contacto</th>
                  <th className="py-3 px-4 font-semibold" scope="col">Último Mensaje</th>
                  <th className="py-3 px-4 font-semibold" scope="col">Estado</th>
                  <th className="py-3 px-4 font-semibold text-right" scope="col">Fecha / Hora</th>
                  <th className="py-3 px-4 font-semibold text-center" scope="col">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container-high/30 text-on-surface">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-outline text-xs">
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        Conectando con Supabase...
                      </div>
                    </td>
                  </tr>
                ) : isSupabaseMisconfigured ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-outline">cloud_off</span>
                        <p className="text-sm font-medium text-on-surface-variant">Sin conexión a Supabase</p>
                        <p className="text-xs text-outline max-w-sm">
                          Configura <code className="bg-surface-container-high px-1 rounded">.env.local</code> con tus credenciales reales para ver las conversaciones.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : filteredConversations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <span className="material-symbols-outlined text-[32px] text-outline">
                          {searchQuery || activeFilter !== "all" ? "search_off" : "inbox"}
                        </span>
                        <p className="text-sm text-outline">
                          {searchQuery || activeFilter !== "all"
                            ? "No se encontraron conversaciones con ese filtro"
                            : "No hay conversaciones aún"}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredConversations.map((row) => {
                    const avatarColorClass =
                      row.avatarColor === "primary"
                        ? "text-primary"
                        : row.avatarColor === "secondary"
                        ? "text-secondary"
                        : row.avatarColor === "tertiary"
                        ? "text-tertiary"
                        : "text-outline";

                    return (
                      <tr
                        key={row.id}
                        className="hover:bg-surface-container/60 transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-lg bg-surface-container-highest flex items-center justify-center text-xs font-bold border border-surface-container-high ${avatarColorClass}`}
                            >
                              {row.initials}
                            </div>
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs text-on-surface truncate font-semibold">
                                {row.name}
                              </span>
                              {row.phone && (
                                <span className="text-[11px] text-outline font-mono">
                                  {row.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 max-w-[220px]">
                          <p className="truncate text-on-surface-variant text-xs">
                            {row.lastMessage}
                          </p>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          {getStatusBadge(row.status)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap text-right text-xs text-outline">
                          <div className="text-on-surface-variant font-medium">{row.date}</div>
                          <div className="font-mono text-[11px] text-outline">{row.time}</div>
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <Link
                            href={`/chat?id=${row.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-surface-container-high hover:bg-primary hover:text-on-primary text-on-surface text-xs font-semibold transition-all group-hover:shadow-sm"
                          >
                            <span>Abrir</span>
                            <span className="material-symbols-outlined text-[14px]">
                              arrow_forward
                            </span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer de la tabla */}
          <div className="p-4 bg-surface-container-high/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-outline text-xs border-t border-surface-container-high/40">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
              <span>
                {filteredConversations.length} de {totalConvs} conversaciones
              </span>
            </div>
            {!isSupabaseMisconfigured && (
              <button
                onClick={() => loadData()}
                className="flex items-center gap-1 text-outline hover:text-primary transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[14px]">refresh</span>
                Actualizar
              </button>
            )}
          </div>
        </section>

        {/* Panel derecho */}
        <div className="lg:col-span-4 space-y-5">
          {/* Card: Distribución de estados */}
          <div className="bg-surface-container-low rounded-xl p-5 shadow-sm space-y-4 border border-surface-container-high/50">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className="text-base font-semibold text-on-surface">
                  Distribución de Estados
                </h3>
                <p className="text-xs text-outline">
                  Desglose en tiempo real de la carga del CRM
                </p>
              </div>
              <span className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">pie_chart</span>
              </span>
            </div>

            {/* Barra visual */}
            {totalConvs > 0 ? (
              <>
                <div className="h-2.5 w-full bg-surface-container-highest rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-primary transition-all duration-500"
                    style={{ width: `${aiPercentage}%` }}
                    title={`${aiPercentage}% IA Autónoma`}
                  />
                  <div
                    className="h-full bg-amber-400 transition-all duration-500"
                    style={{ width: `${waitingPercentage}%` }}
                    title={`${waitingPercentage}% Esperando Humano`}
                  />
                  <div
                    className="h-full bg-sky-400 transition-all duration-500"
                    style={{ width: `${humanPercentage}%` }}
                    title={`${humanPercentage}% Intervención Humana`}
                  />
                </div>

                <div className="space-y-2">
                  {[
                    { label: "IA Autónoma", count: aiCount, pct: aiPercentage, color: "bg-primary", textColor: "text-primary" },
                    { label: "Esperando Asesor", count: waitingCount, pct: waitingPercentage, color: "bg-amber-400", textColor: "text-amber-300" },
                    { label: "Asesor Activo", count: humanCount, pct: humanPercentage, color: "bg-sky-400", textColor: "text-sky-300" },
                  ].map((seg) => (
                    <div
                      key={seg.label}
                      className="flex items-center justify-between p-2 rounded-lg bg-surface-container-high/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${seg.color}`}></span>
                        <span className="text-xs text-on-surface">{seg.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-on-surface font-mono">{seg.count}</span>
                        <span className={`text-[11px] font-bold ${seg.textColor}`}>({seg.pct}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-4 text-center text-outline text-xs">
                {loading ? "Cargando datos..." : "Sin datos disponibles"}
              </div>
            )}
          </div>

          {/* Card: Accesos Rápidos */}
          <div className="bg-surface-container-low rounded-xl p-5 shadow-sm space-y-3.5 border border-surface-container-high/50">
            <div className="space-y-0.5">
              <h3 className="text-base font-semibold text-on-surface">Accesos Rápidos</h3>
              <p className="text-xs text-outline">Navegación directa a las secciones</p>
            </div>
            <div className="space-y-2">
              {[
                {
                  href: "/chat",
                  icon: "chat",
                  label: "Bandeja de Mensajes",
                  sub: "Conversaciones de WhatsApp en vivo",
                  color: "text-primary",
                },
                {
                  href: "/contactos",
                  icon: "contact_page",
                  label: "Directorio de Contactos",
                  sub: `${totalContacts} contactos sincronizados`,
                  color: "text-secondary",
                },
                {
                  href: "/configuracion",
                  icon: "settings",
                  label: "Configuración del Sistema",
                  sub: "Estado de servicios y prompts del bot",
                  color: "text-tertiary",
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between p-3 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center ${item.color} group-hover:scale-110 transition-transform`}>
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-on-surface">{item.label}</span>
                      <span className="text-[11px] text-outline">{item.sub}</span>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-[18px] text-outline group-hover:text-primary transition-colors">
                    chevron_right
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
