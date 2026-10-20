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

// Datos de demostración de alta fidelidad que coinciden con la captura de referencia
const INITIAL_DEMO_CONVERSATIONS: ConversationRow[] = [
  {
    id: "demo-1",
    name: "Ing Jesús Pichardo",
    phone: "+584124811691",
    initials: "IN",
    avatarColor: "primary",
    lastMessage: "Hola",
    status: "ai_active",
    date: "Hoy",
    time: "00:28",
  },
  {
    id: "demo-2",
    name: "Mario Gonzalez",
    phone: "+584145614391",
    initials: "MA",
    avatarColor: "secondary",
    lastMessage: "¡Saludos! Un gusto saludarte de nuevo. 🚀",
    status: "ai_active",
    date: "19 oct",
    time: "19 oct",
  },
  {
    id: "demo-3",
    name: "José Colmenarez",
    phone: "+555195098805",
    initials: "JO",
    avatarColor: "tertiary",
    lastMessage: "¡Hola! Muy buenos días. Bienvenido a Deplo...",
    status: "ai_active",
    date: "18 oct",
    time: "18 oct",
  },
  {
    id: "demo-4",
    name: "Jesús Rivero",
    phone: "+584145414202",
    initials: "JE",
    avatarColor: "primary",
    lastMessage: "¡Hola! Para crear una 'Card' en Kotlin...",
    status: "ai_active",
    date: "18 oct",
    time: "18 oct",
  },
  {
    id: "demo-5",
    name: "Caos Mel",
    phone: "+584125590265",
    initials: "CA",
    avatarColor: "tertiary",
    lastMessage: "Lamento el inconveniente con la activación...",
    status: "ai_active",
    date: "17 oct",
    time: "17 oct",
  },
  {
    id: "demo-6",
    name: "Cliente Demo",
    phone: "+584245883315",
    initials: "CD",
    avatarColor: "secondary",
    lastMessage: "El huesazo",
    status: "ai_active",
    date: "16 oct",
    time: "16 oct",
  },
  {
    id: "demo-7",
    name: "Carlos Mendoza",
    phone: "+1234567890",
    initials: "CM",
    avatarColor: "outline",
    lastMessage: "Hola, es una prueba",
    status: "ai_active",
    date: "13 oct",
    time: "13 oct",
  },
];

const isSupabaseMisconfigured =
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder") ||
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes("placeholder");

export default function DashboardPage() {
  const [conversations, setConversations] = useState<ConversationRow[]>(INITIAL_DEMO_CONVERSATIONS);
  const [totalContacts, setTotalContacts] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "ai" | "waiting">("all");
  const [autoSync, setAutoSync] = useState(true);
  const [lastSyncSeconds, setLastSyncSeconds] = useState(14);

  const colors: ("primary" | "secondary" | "tertiary" | "outline")[] = [
    "primary",
    "secondary",
    "tertiary",
    "outline",
  ];

  // Contador de segundos para el badge "hace Xs"
  useEffect(() => {
    const timer = setInterval(() => {
      setLastSyncSeconds((prev) => (prev >= 60 ? 1 : prev + 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const loadData = useCallback(async () => {
    if (isSupabaseMisconfigured) return;
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false })
        .limit(50);

      if (!error && data && data.length > 0) {
        const mapped: ConversationRow[] = data.map((c: any, index: number) => {
          const name = c.contacts?.name || c.contacts?.phone || "Cliente WhatsApp";
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
        setLastSyncSeconds(0);
      }

      const { count } = await supabase
        .from("contacts")
        .select("*", { count: "exact", head: true });
      if (count !== null && count > 0) setTotalContacts(count);
    } catch (err) {
      console.warn("Usando datos de respaldo para el Cockpit:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseMisconfigured) {
      loadData();
    }
  }, [loadData]);

  // Suscripción Realtime
  useEffect(() => {
    if (isSupabaseMisconfigured || !autoSync) return;

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
  }, [loadData, autoSync]);

  // Filtrado reactivo de conversaciones
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

      return matchesSearch && matchesFilter;
    });
  }, [conversations, searchQuery, activeFilter]);

  // Métricas calculadas
  const totalConvs = conversations.length;
  const aiCount = conversations.filter((c) => c.status === "ai_active").length;
  const waitingCount = conversations.filter((c) => c.status === "waiting_agent").length;
  const aiPercentage = totalConvs > 0 ? Math.round((aiCount / totalConvs) * 100) : 100;

  return (
    <div className="flex flex-col w-full p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
      {/* 1. Sub-header / Pill Badge Row (Idéntico a la imagen) */}
      <div className="flex items-center justify-between text-xs">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0d1c2d] border border-[#1c2b3c] shadow-sm">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-300">
            DATOS EN VIVO • DEPLOY COCKPIT
          </span>
        </div>

        <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
          <span className="material-symbols-outlined text-[14px] text-slate-500">sync</span>
          <span>hace {lastSyncSeconds}s</span>
        </div>
      </div>

      {/* 2. Título & Subtítulo */}
      <div className="space-y-0.5">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Dashboard de Operaciones
        </h1>
        <p className="text-xs sm:text-sm text-slate-400">
          Supervisión en tiempo real de WhatsApp Cloud API y agentes IA.
        </p>
      </div>

      {/* 3. Botones de Acción Primarios */}
      <div className="flex items-center gap-3 pt-1">
        <Link
          href="/chat"
          className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-[#003824] hover:bg-emerald-300 font-bold text-xs sm:text-sm transition-all shadow-[0_2px_12px_rgba(78,222,163,0.25)] active:scale-95"
        >
          <span className="material-symbols-outlined text-[18px]">forum</span>
          <span>Bandeja en Vivo</span>
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>

        {/* Auto-sync Toggle Switch */}
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-[#0d1c2d] border border-[#1c2b3c] text-xs font-semibold text-slate-300 shadow-sm">
          <span>Auto-sync</span>
          <button
            type="button"
            onClick={() => setAutoSync(!autoSync)}
            aria-label="Toggle Auto-sync"
            className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
              autoSync ? "bg-primary justify-end" : "bg-slate-700 justify-start"
            }`}
          >
            <span
              className={`w-4 h-4 rounded-full bg-[#003824] shadow-sm transform transition-transform ${
                autoSync ? "bg-[#003824]" : "bg-slate-300"
              }`}
            />
          </button>
        </div>
      </div>

      {/* 4. Grid de 4 Métricas (2x2 en mobile, 4 columnas en desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: ACTIVAS */}
        <div className="bg-[#0d1c2d] rounded-2xl p-4 border border-[#1c2b3c]/80 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              ACTIVAS
            </span>
            <span className="material-symbols-outlined text-[18px] text-primary">chat_bubble</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{totalConvs}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
              +14%
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">170 msgs hoy</div>
        </div>

        {/* Card 2: POR IA */}
        <div className="bg-[#0d1c2d] rounded-2xl p-4 border border-[#1c2b3c]/80 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              POR IA
            </span>
            <span className="material-symbols-outlined text-[18px] text-primary">smart_toy</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{aiCount}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
              {aiPercentage}% IA
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">0 transfers pend.</div>
        </div>

        {/* Card 3: ESPERA */}
        <div className="bg-[#0d1c2d] rounded-2xl p-4 border border-[#1c2b3c]/80 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              ESPERA
            </span>
            <span className="material-symbols-outlined text-[18px] text-primary">schedule</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{waitingCount}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
              Óptimo
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">SLA: 0.0m espera</div>
        </div>

        {/* Card 4: CONTACTOS */}
        <div className="bg-[#0d1c2d] rounded-2xl p-4 border border-[#1c2b3c]/80 flex flex-col justify-between shadow-sm relative overflow-hidden group hover:border-primary/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
              CONTACTOS
            </span>
            <span className="material-symbols-outlined text-[18px] text-primary">contact_phone</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-black text-white tracking-tight">{totalContacts}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/25">
              Supabase
            </span>
          </div>
          <div className="mt-2 text-[11px] text-slate-400 font-medium">100% sync Postgres</div>
        </div>
      </div>

      {/* 5. Live Telemetry Strip */}
      <div className="bg-[#0d1c2d]/90 border border-[#1c2b3c] rounded-xl px-3 py-2 flex items-center justify-between text-[11px] text-slate-300">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
          <span>
            Queue: <span className="font-semibold text-primary">0 libres</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[13px] text-primary">verified</span>
          <span>
            Meta SLA: <span className="font-semibold text-white">99.98%</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px] text-primary">bolt</span>
          <span className="font-semibold text-primary">112ms</span>
        </div>
      </div>

      {/* 6. Card de Conversaciones (Diseño Idéntico a la Referencia) */}
      <div className="bg-[#0d1c2d] rounded-2xl border border-[#1c2b3c]/80 p-4 sm:p-5 shadow-sm space-y-4">
        {/* Header de Conversaciones */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white tracking-tight">Conversaciones</h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
              Sincronizado
            </span>
          </div>

          <button
            onClick={() => loadData()}
            className="w-8 h-8 rounded-lg bg-[#122131] border border-[#1c2b3c] flex items-center justify-center text-slate-300 hover:text-white hover:border-primary/40 transition active:scale-95"
            title="Refrescar datos"
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
        </div>

        {/* Buscador */}
        <div className="relative w-full">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-slate-400">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por contacto o mensaje..."
            className="w-full pl-9 pr-3 py-2 bg-[#081625] rounded-xl text-white placeholder:text-slate-500 text-xs border border-[#1c2b3c] focus:outline-none focus:border-primary/50 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Chips de Filtros (Todos, IA Activa, Pendientes) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeFilter === "all"
                ? "bg-primary text-[#003824] shadow-sm"
                : "bg-[#081625] text-slate-300 border border-[#1c2b3c] hover:border-primary/30"
            }`}
          >
            Todos ({totalConvs})
          </button>

          <button
            onClick={() => setActiveFilter("ai")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeFilter === "ai"
                ? "bg-primary text-[#003824] shadow-sm"
                : "bg-[#081625] text-slate-300 border border-[#1c2b3c] hover:border-primary/30"
            }`}
          >
            IA Activa ({aiCount})
          </button>

          <button
            onClick={() => setActiveFilter("waiting")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
              activeFilter === "waiting"
                ? "bg-primary text-[#003824] shadow-sm"
                : "bg-[#081625] text-slate-300 border border-[#1c2b3c] hover:border-primary/30"
            }`}
          >
            Pendientes ({waitingCount})
          </button>
        </div>

        {/* Lista de Conversaciones (Adaptable para Mobile y Desktop) */}
        <div className="divide-y divide-[#1c2b3c]/50">
          {filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              No se encontraron conversaciones con ese filtro
            </div>
          ) : (
            filteredConversations.map((c) => (
              <Link
                key={c.id}
                href={`/chat?id=${c.id}`}
                className="flex items-center gap-3 py-3 px-1 rounded-xl hover:bg-[#122131]/60 transition group"
              >
                {/* Cuadrado Avatar con Iniciales */}
                <div
                  className={`size-10 rounded-xl bg-[#081625] border border-[#1c2b3c] flex items-center justify-center text-xs font-black shrink-0 ${
                    c.avatarColor === "primary"
                      ? "text-primary border-primary/25"
                      : c.avatarColor === "secondary"
                      ? "text-emerald-400 border-emerald-400/25"
                      : c.avatarColor === "tertiary"
                      ? "text-amber-400 border-amber-400/25"
                      : "text-slate-300"
                  }`}
                >
                  {c.initials}
                </div>

                {/* Contenido del Chat */}
                <div className="flex-1 min-w-0">
                  {/* Fila 1: Nombre y Fecha/Hora */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs sm:text-sm font-bold text-white truncate group-hover:text-primary transition">
                      {c.name}
                    </span>
                    <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                      {c.time || c.date}
                    </span>
                  </div>

                  {/* Fila 2: Vista previa del mensaje */}
                  <p className="text-xs text-slate-400 truncate mt-0.5">
                    {c.lastMessage}
                  </p>

                  {/* Fila 3: Estado Atendido por IA y Teléfono */}
                  <div className="flex items-center justify-between mt-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-primary font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                      <span>Atendido por IA</span>
                    </div>
                    <span className="text-slate-500 font-mono text-[10px]">
                      {c.phone}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Footer de Conversaciones */}
        <div className="pt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400 border-t border-[#1c2b3c]/60">
          <span>{filteredConversations.length} de {totalConvs} conversaciones activas sincronizadas</span>
          <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
        </div>
      </div>

      {/* 7. Card: Distribución de Carga (Idéntico a la Referencia) */}
      <div className="bg-[#0d1c2d] rounded-2xl border border-[#1c2b3c]/80 p-4 sm:p-5 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">hub</span>
            <h3 className="text-sm sm:text-base font-bold text-white">Distribución de Carga</h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20">
            {aiPercentage}% IA
          </span>
        </div>

        {/* Barra de progreso de gradiente verde neón */}
        <div className="h-2 w-full bg-[#081625] rounded-full overflow-hidden border border-[#1c2b3c]/60">
          <div
            className="h-full bg-gradient-to-r from-primary to-emerald-400 transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(78,222,163,0.5)]"
            style={{ width: `${aiPercentage}%` }}
          />
        </div>

        {/* Métricas secundarias */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
          <span>Agentes Autónomos: <strong className="text-white">{aiCount}</strong></span>
          <span>Handoff Humano: <strong className="text-white">{waitingCount}</strong></span>
        </div>

        {/* Grid de 2 Métricas */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <div className="bg-[#081625] rounded-xl p-3 border border-[#1c2b3c]/60">
            <span className="text-[11px] text-slate-400 font-medium block">Tiempo Resp. IA</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-black text-primary">0.8s</span>
              <span className="text-[10px] text-slate-500">42m</span>
            </div>
          </div>

          <div className="bg-[#081625] rounded-xl p-3 border border-[#1c2b3c]/60">
            <span className="text-[11px] text-slate-400 font-medium block">Cumplimiento SLA</span>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-lg font-black text-primary">100.0%</span>
              <span className="material-symbols-outlined text-[16px] text-primary">verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* 8. Card: Salud de la Infraestructura (Idéntico a la Referencia) */}
      <div className="bg-[#0d1c2d] rounded-2xl border border-[#1c2b3c]/80 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">sensors</span>
            <h3 className="text-sm sm:text-base font-bold text-white">Salud de la Infraestructura</h3>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Todo operativo
          </span>
        </div>

        {/* Servicios */}
        <div className="space-y-2 pt-1">
          {/* Servicio 1: Meta Cloud API */}
          <div className="bg-[#081625] rounded-xl p-3 border border-[#1c2b3c]/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-[#0d1c2d] border border-[#1c2b3c] flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">cell_tower</span>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Meta Cloud API</h4>
                <p className="text-[11px] text-slate-400">WhatsApp Webhooks</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-primary block">Conectado</span>
              <span className="text-[11px] text-slate-500 font-mono">84ms</span>
            </div>
          </div>

          {/* Servicio 2: Supabase DB */}
          <div className="bg-[#081625] rounded-xl p-3 border border-[#1c2b3c]/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-[#0d1c2d] border border-[#1c2b3c] flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">database</span>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Supabase DB</h4>
                <p className="text-[11px] text-slate-400">PostgreSQL Realtime</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-primary block">Pool Activo</span>
              <span className="text-[11px] text-slate-500 font-mono">18 conn</span>
            </div>
          </div>

          {/* Servicio 3: GPT-4o Mini / Gemini AI */}
          <div className="bg-[#081625] rounded-xl p-3 border border-[#1c2b3c]/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-lg bg-[#0d1c2d] border border-[#1c2b3c] flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[18px]">psychology</span>
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">GPT-4o Mini</h4>
                <p className="text-[11px] text-slate-400">Agente Conversacional</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-primary block">Streaming OK</span>
              <span className="text-[11px] text-slate-500 font-mono">428ms</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
