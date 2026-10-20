"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Kanban,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  UserCheck,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { CRM_TAGS, CRMTag, getAllTagsMap, toggleLeadTag } from "@/lib/tags";
import { exportLeadsToCSV } from "@/lib/export";

export type PipelineStage =
  | "nuevo"
  | "calificado"
  | "negociacion"
  | "propuesta"
  | "ganado";

export interface PipelineColumn {
  id: PipelineStage;
  title: string;
  description: string;
  badgeClass: string;
  borderClass: string;
  dotColor: string;
}

const PIPELINE_COLUMNS: PipelineColumn[] = [
  {
    id: "nuevo",
    title: "1. Nuevo Lead",
    description: "Contacto inicial entrante por WhatsApp",
    badgeClass: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    borderClass: "border-sky-500/20",
    dotColor: "bg-sky-400",
  },
  {
    id: "calificado",
    title: "2. Calificado por IA",
    description: "Interactuando activamente con el bot",
    badgeClass: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    borderClass: "border-emerald-500/20",
    dotColor: "bg-emerald-400",
  },
  {
    id: "negociacion",
    title: "3. En Negociación / Asesor",
    description: "Atención comercial personalizada",
    badgeClass: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    borderClass: "border-amber-400/20",
    dotColor: "bg-amber-400",
  },
  {
    id: "propuesta",
    title: "4. Presupuesto Enviado",
    description: "Cotización formal entregada",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
    borderClass: "border-indigo-500/20",
    dotColor: "bg-indigo-400",
  },
  {
    id: "ganado",
    title: "5. Ganado / Cerrado",
    description: "Proyecto contratado con éxito",
    badgeClass: "bg-signal/20 text-signal border-signal/40",
    borderClass: "border-signal/30",
    dotColor: "bg-signal",
  },
];

interface LeadCard {
  conversationId: string;
  contactId: string;
  name: string;
  phone: string;
  stage: PipelineStage;
  status: "ai_active" | "human_takeover" | "waiting_agent" | "resolved";
  lastMessage: string | null;
  lastMessageAt: string;
  createdAt: string;
  tags: string[];
}

const LOCAL_STORAGE_STAGES_KEY = "crm_pipeline_stages";

export default function PipelinePage() {
  const [leads, setLeads] = useState<LeadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>("all");
  const [tagsMap, setTagsMap] = useState<Record<string, string[]>>({});

  // Cargar conversaciones y mapear al pipeline
  const fetchPipelineData = async () => {
    try {
      const { data: convData, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false });

      if (error) throw error;

      // Cargar mapeo de etapas personalizadas desde localStorage
      let savedStages: Record<string, PipelineStage> = {};
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_STAGES_KEY);
        if (raw) savedStages = JSON.parse(raw);
      } catch {}

      const allTags = getAllTagsMap();
      setTagsMap(allTags);

      const mappedLeads: LeadCard[] = (convData || []).map((c: any) => {
        const contactId = c.contact_id || c.contacts?.id || c.id;

        // Determinar etapa por defecto basada en el estado de la conversación
        let defaultStage: PipelineStage = "nuevo";
        if (c.status === "ai_active") defaultStage = "calificado";
        if (c.status === "waiting_agent" || c.status === "human_takeover") defaultStage = "negociacion";
        if (c.status === "resolved") defaultStage = "ganado";

        const stage = savedStages[c.id] || defaultStage;

        return {
          conversationId: c.id,
          contactId,
          name: c.contacts?.name || c.contacts?.phone || "Lead Sin Nombre",
          phone: c.contacts?.phone || "",
          stage,
          status: c.status,
          lastMessage: c.last_message_preview,
          lastMessageAt: c.last_message_at,
          createdAt: c.created_at,
          tags: allTags[contactId] || [],
        };
      });

      setLeads(mappedLeads);
    } catch (err) {
      console.error("Error al cargar pipeline:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPipelineData();
  }, []);

  // Mover lead a otra etapa
  const handleMoveStage = (conversationId: string, newStage: PipelineStage) => {
    setLeads((prev) => {
      const updated = prev.map((lead) =>
        lead.conversationId === conversationId ? { ...lead, stage: newStage } : lead
      );

      // Persistir en localStorage
      try {
        const raw = localStorage.getItem(LOCAL_STORAGE_STAGES_KEY);
        const map: Record<string, PipelineStage> = raw ? JSON.parse(raw) : {};
        map[conversationId] = newStage;
        localStorage.setItem(LOCAL_STORAGE_STAGES_KEY, JSON.stringify(map));
      } catch (err) {
        console.error("Error guardando etapa:", err);
      }

      return updated;
    });
  };

  // Alternar tag para un lead
  const handleToggleTag = (contactId: string, tagId: string) => {
    const updatedTags = toggleLeadTag(contactId, tagId);
    setTagsMap((prev) => ({ ...prev, [contactId]: updatedTags }));
    setLeads((prev) =>
      prev.map((l) => (l.contactId === contactId ? { ...l, tags: updatedTags } : l))
    );
  };

  // Filtrado de leads por texto y etiqueta
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const term = searchTerm.toLowerCase().trim();
      const matchSearch =
        !term ||
        lead.name.toLowerCase().includes(term) ||
        lead.phone.toLowerCase().includes(term) ||
        (lead.lastMessage || "").toLowerCase().includes(term);

      const matchTag =
        selectedTagFilter === "all" || lead.tags.includes(selectedTagFilter);

      return matchSearch && matchTag;
    });
  }, [leads, searchTerm, selectedTagFilter]);

  // Exportar a CSV
  const handleExport = () => {
    const exportable = filteredLeads.map((l) => ({
      id: l.conversationId,
      name: l.name,
      phone: l.phone,
      status: `Etapa: ${l.stage} (${l.status})`,
      lastMessage: l.lastMessage,
      lastMessageAt: l.lastMessageAt,
      createdAt: l.createdAt,
      tags: l.tags.map((tId) => CRM_TAGS.find((t) => t.id === tId)?.name || tId),
    }));
    exportLeadsToCSV(exportable, `Pipeline_Deploy_CRM_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 pb-16">
      {/* Encabezado Principal */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Kanban className="size-4 text-signal" />
            <p className="text-xs font-semibold tracking-wider uppercase text-signal">
              Gestión Comercial & Pipeline
            </p>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Tablero Kanban de Ventas
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Monitorea el progreso de cada prospecto desde el primer contacto en WhatsApp hasta el cierre comercial.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botón Refrescar */}
          <button
            type="button"
            onClick={fetchPipelineData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10 transition active:scale-95"
            title="Actualizar datos"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>

          {/* Botón Exportar CSV / Excel */}
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-xl bg-signal px-3.5 py-2 text-xs font-bold text-ink shadow-glow transition hover:bg-emerald-300 active:scale-95"
            title="Descargar listado en formato Excel / CSV"
          >
            <Download className="size-3.5" />
            <span>Exportar CSV</span>
          </button>
        </div>
      </header>

      {/* Barra de Búsqueda y Filtros de Etiquetas */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-xl border border-line bg-panel/80 p-3.5 shadow-md backdrop-blur-xl">
        {/* Input Buscador */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por lead, teléfono o necesidad..."
            className="w-full rounded-lg border border-line bg-ink/70 pl-9 pr-8 py-1.5 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Filtros por Etiqueta (Pills) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1 pr-1 shrink-0">
            <Tag className="size-3" />
            <span>Etiquetas:</span>
          </span>
          <button
            onClick={() => setSelectedTagFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 ${
              selectedTagFilter === "all"
                ? "bg-signal text-ink font-bold"
                : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
            }`}
          >
            Todas ({leads.length})
          </button>
          {CRM_TAGS.map((tag) => {
            const count = leads.filter((l) => l.tags.includes(tag.id)).length;
            const isSelected = selectedTagFilter === tag.id;
            return (
              <button
                key={tag.id}
                onClick={() => setSelectedTagFilter(isSelected ? "all" : tag.id)}
                className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 flex items-center gap-1 border ${
                  isSelected
                    ? `${tag.bgClass} ${tag.borderClass} ${tag.textClass} font-bold ring-1 ring-white/20`
                    : "border-transparent bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                <span>#{tag.name}</span>
                {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tablero Kanban (5 Columnas scrolleables horizontalmente en móvil) */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start overflow-x-auto pb-4">
        {PIPELINE_COLUMNS.map((col, colIndex) => {
          const colLeads = filteredLeads.filter((l) => l.stage === col.id);

          return (
            <div
              key={col.id}
              className={`flex flex-col rounded-2xl border ${col.borderClass} bg-panel/75 shadow-xl backdrop-blur-xl min-h-[500px] overflow-hidden`}
            >
              {/* Header de la Columna */}
              <div className="border-b border-line p-3.5 space-y-1 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${col.dotColor}`} />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                      {col.title}
                    </h3>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${col.badgeClass}`}
                  >
                    {colLeads.length}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 line-clamp-1">{col.description}</p>
              </div>

              {/* Lista de Tarjetas en la Columna */}
              <div className="flex-1 p-2.5 space-y-2.5 overflow-y-auto max-h-[calc(100vh-22rem)]">
                {colLeads.length === 0 ? (
                  <div className="grid place-items-center h-36 text-center text-slate-500 text-xs border border-dashed border-line/60 rounded-xl p-4">
                    <p>Sin prospectos en esta etapa</p>
                  </div>
                ) : (
                  colLeads.map((lead) => {
                    const initials = lead.name.slice(0, 2).toUpperCase();

                    return (
                      <article
                        key={lead.conversationId}
                        className="rounded-xl border border-line bg-ink/70 p-3.5 shadow-md hover:border-signal/40 transition group relative space-y-2.5"
                      >
                        {/* Cabecera de la Tarjeta */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="grid size-8 place-items-center rounded-lg bg-signal/15 text-xs font-bold text-signal shrink-0 ring-1 ring-signal/30">
                              {initials}
                            </span>
                            <div className="min-w-0">
                              <h4 className="truncate text-xs font-semibold text-white group-hover:text-signal transition">
                                {lead.name}
                              </h4>
                              <p className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                                <Phone className="size-2.5" />
                                <span>{lead.phone}</span>
                              </p>
                            </div>
                          </div>

                          {/* Link directo a WhatsApp Web */}
                          <a
                            href={`https://wa.me/${lead.phone.replace("+", "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-500 hover:text-emerald-400 transition p-1 shrink-0"
                            title="Abrir en WhatsApp Web oficial"
                          >
                            <Phone className="size-3" />
                          </a>
                        </div>

                        {/* Mensaje de vista previa */}
                        {lead.lastMessage && (
                          <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed bg-white/[0.03] p-2 rounded-lg border border-line/40">
                            {lead.lastMessage}
                          </p>
                        )}

                        {/* Etiquetas (Tags) asignadas */}
                        <div className="flex flex-wrap items-center gap-1">
                          {lead.tags.map((tagId) => {
                            const tagInfo = CRM_TAGS.find((t) => t.id === tagId);
                            if (!tagInfo) return null;
                            return (
                              <button
                                key={tagId}
                                onClick={() => handleToggleTag(lead.contactId, tagId)}
                                className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold transition ${tagInfo.bgClass} ${tagInfo.borderClass} ${tagInfo.textClass} hover:opacity-80`}
                                title="Clic para remover etiqueta"
                              >
                                #{tagInfo.name} ×
                              </button>
                            );
                          })}

                          {/* Menú para añadir etiqueta */}
                          <div className="relative group/tagMenu">
                            <button
                              type="button"
                              className="rounded-md border border-dashed border-slate-600 px-1.5 py-0.5 text-[9px] text-slate-400 hover:text-white hover:border-signal/50 transition flex items-center gap-0.5"
                              title="Añadir etiqueta"
                            >
                              <Plus className="size-2.5" />
                              <span>Tag</span>
                            </button>
                            <div className="absolute left-0 bottom-full mb-1 hidden group-hover/tagMenu:flex flex-col bg-panel border border-line p-1.5 rounded-lg shadow-2xl z-20 w-36 gap-1">
                              {CRM_TAGS.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => handleToggleTag(lead.contactId, t.id)}
                                  className={`text-left text-[10px] px-2 py-1 rounded font-medium transition ${
                                    lead.tags.includes(t.id)
                                      ? `${t.bgClass} ${t.textClass} font-bold`
                                      : "hover:bg-white/10 text-slate-300"
                                  }`}
                                >
                                  #{t.name} {lead.tags.includes(t.id) ? "✓" : ""}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Pie de la Tarjeta: Navegación de Etapas y Botón Abrir Chat */}
                        <div className="flex items-center justify-between border-t border-line/50 pt-2 text-[10px]">
                          {/* Botón Mover hacia atrás */}
                          <button
                            type="button"
                            disabled={colIndex === 0}
                            onClick={() =>
                              handleMoveStage(lead.conversationId, PIPELINE_COLUMNS[colIndex - 1].id)
                            }
                            className="rounded p-1 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition"
                            title="Mover a etapa anterior"
                          >
                            <ChevronLeft className="size-3.5" />
                          </button>

                          {/* Botón Abrir Chat */}
                          <Link
                            href={`/chat?id=${lead.conversationId}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-line bg-white/5 px-2.5 py-1 font-semibold text-slate-200 hover:border-signal/40 hover:text-signal hover:bg-signal/10 transition"
                          >
                            <MessageSquare className="size-3" />
                            <span>Abrir Chat</span>
                          </Link>

                          {/* Botón Mover hacia adelante */}
                          <button
                            type="button"
                            disabled={colIndex === PIPELINE_COLUMNS.length - 1}
                            onClick={() =>
                              handleMoveStage(lead.conversationId, PIPELINE_COLUMNS[colIndex + 1].id)
                            }
                            className="rounded p-1 text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-20 disabled:pointer-events-none transition"
                            title="Mover a siguiente etapa"
                          >
                            <ChevronRight className="size-3.5" />
                          </button>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
