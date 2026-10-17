"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  ExternalLink,
  Info,
  MessageSquare,
  MessageSquarePlus,
  Phone,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Contact {
  id: string;
  name: string | null;
  phone: string;
}

interface Conversation {
  id: string;
  contact_id: string;
  channel: string;
  status: "ai_active" | "human_takeover" | "waiting_agent" | "resolved";
  unread_count: number;
  last_message_preview: string | null;
  last_message_at: string;
  contacts?: Contact;
}

interface Message {
  id: string;
  conversation_id: string;
  sender: "client" | "bot" | "agent" | "system";
  content: string;
  created_at: string;
}

type FilterStatus = "all" | "waiting_agent" | "ai_active" | "human_takeover";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Mobile state navigation: "list" (lista de chats) o "chat" (chat activo)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  // Sheet modal de información del contacto en móvil
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  // Notas del asesor por contacto (guardadas en localStorage)
  const [advisorNotes, setAdvisorNotes] = useState<Record<string, string>>({});

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConversation = conversations.find((c) => c.id === selectedId);

  // Auto-scroll al último mensaje dentro del contenedor exclusivo de mensajes (sin desplazar la ventana)
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cargar notas desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm_advisor_notes");
      if (saved) {
        setAdvisorNotes(JSON.parse(saved));
      }
    } catch {
      // Ignorar si no está disponible
    }
  }, []);

  const handleSaveNote = (contactId: string, text: string) => {
    const updated = { ...advisorNotes, [contactId]: text };
    setAdvisorNotes(updated);
    try {
      localStorage.setItem("crm_advisor_notes", JSON.stringify(updated));
    } catch {
      // Ignorar
    }
  };

  // Escuchar selección rápida de chat desde notificaciones globales
  useEffect(() => {
    const handleSelectChat = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string }>;
      if (customEvent.detail?.id) {
        setSelectedId(customEvent.detail.id);
        setMobileView("chat");
      }
    };

    window.addEventListener("crm:select-chat", handleSelectChat);
    return () => {
      window.removeEventListener("crm:select-chat", handleSelectChat);
    };
  }, []);

  // 1. Cargar lista de conversaciones
  const fetchConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("conversations")
        .select("*, contacts(*)")
        .order("last_message_at", { ascending: false });

      if (error) {
        console.error("Error al cargar conversaciones:", error.message);
        return;
      }

      if (data) {
        setConversations(data as Conversation[]);
        if (data.length > 0 && !selectedId) {
          const urlParamId =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("id")
              : null;
          const matched = data.find((c) => c.id === urlParamId);
          if (matched) {
            setSelectedId(matched.id);
            // Si viene con id explícito en URL, abrir directo el chat en móvil
            setMobileView("chat");
          } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
            // En desktop seleccionar automáticamente el primero
            setSelectedId(data[0].id);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Cargar mensajes de la conversación activa
  const fetchMessages = async (convId: string) => {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error al cargar mensajes:", error.message);
      return;
    }

    if (data) {
      setMessages(data as Message[]);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
    }
  }, [selectedId]);

  // 3. Suscripción a Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => [...prev, newMsg]);
          }
          fetchConversations();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => {
          const updatedConv = payload.new as Conversation;
          setConversations((prev) =>
            prev.map((c) => (c.id === updatedConv.id ? { ...c, ...updatedConv } : c))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  // 4. Enviar mensaje como asesor humano
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedId || sending) return;

    const textToSend = inputText.trim();
    setInputText("");
    setSending(true);

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          text: textToSend,
        }),
      });

      if (!res.ok) {
        console.error("Error al enviar mensaje vía API");
      }

      await fetchMessages(selectedId);
      await fetchConversations();
    } catch (err: unknown) {
      console.error("Error al enviar mensaje:", err);
    } finally {
      setSending(false);
      // Mantener el foco en el input en móvil para escribir rápido
      inputRef.current?.focus();
    }
  };

  // 5. Conmutar estado de intervención humana / IA
  const toggleStatus = async () => {
    if (!activeConversation) return;

    const newStatus =
      activeConversation.status === "ai_active" ? "human_takeover" : "ai_active";

    try {
      await supabase
        .from("conversations")
        .update({ status: newStatus })
        .eq("id", activeConversation.id);

      await supabase.from("messages").insert({
        conversation_id: activeConversation.id,
        sender: "system",
        content:
          newStatus === "human_takeover"
            ? "El asesor ha tomado el control manual de la conversación."
            : "Se ha reactivado la atención automática con Inteligencia Artificial.",
      });

      fetchConversations();
      fetchMessages(activeConversation.id);
    } catch (err) {
      console.error("Error al cambiar estado:", err);
    }
  };

  const getStatusLabel = (status: Conversation["status"]) => {
    switch (status) {
      case "ai_active":
        return {
          text: "Atendido por IA",
          shortText: "IA Activa",
          color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20",
          dotColor: "bg-emerald-400",
        };
      case "human_takeover":
        return {
          text: "Atendido por Humano",
          shortText: "Asesor",
          color: "text-sky-300 bg-sky-400/10 border-sky-400/20",
          dotColor: "bg-sky-400",
        };
      case "waiting_agent":
        return {
          text: "Esperando Asesor",
          shortText: "Esperando",
          color: "text-amber-300 bg-amber-400/10 border-amber-400/20",
          dotColor: "bg-amber-400 animate-pulse",
        };
      case "resolved":
        return {
          text: "Resuelto",
          shortText: "Resuelto",
          color: "text-slate-300 bg-slate-400/10 border-slate-400/20",
          dotColor: "bg-slate-400",
        };
      default:
        return {
          text: status,
          shortText: status,
          color: "text-slate-300 bg-white/10 border-line",
          dotColor: "bg-slate-400",
        };
    }
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  };

  // Conversaciones filtradas por búsqueda y estado
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const contactName = (c.contacts?.name || "").toLowerCase();
      const phone = (c.contacts?.phone || "").toLowerCase();
      const preview = (c.last_message_preview || "").toLowerCase();
      const query = searchTerm.toLowerCase().trim();

      const matchesSearch =
        !query ||
        contactName.includes(query) ||
        phone.includes(query) ||
        preview.includes(query);

      const matchesStatus =
        statusFilter === "all" ? true : c.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [conversations, searchTerm, statusFilter]);

  const waitingCount = conversations.filter((c) => c.status === "waiting_agent").length;

  return (
    <div className="mx-auto flex h-[calc(100dvh-5rem)] md:h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-line bg-panel/85 shadow-2xl backdrop-blur-xl">
      {/* Contenedor Principal: En tablet y desktop (md+) muestra lista y chat lado a lado. En móvil conmuta entre lista y chat */}
      <div className="relative flex flex-1 overflow-hidden w-full">
        {/* ============================================================== */}
        {/* COLUMNA 1: LISTA DE CONVERSACIONES                              */}
        {/* ============================================================== */}
        <aside
          className={`h-full w-full md:w-80 lg:w-96 shrink-0 flex-col border-line bg-panel/95 md:border-r ${
            mobileView === "list" ? "flex" : "hidden"
          } md:flex`}
        >
          {/* Header de la Lista */}
          <div className="border-b border-line p-3 sm:p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-signal">
                  Bandeja de Entrada
                </p>
                <h1 className="text-lg font-bold text-white">Mensajes WhatsApp</h1>
              </div>
              {waitingCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300 animate-pulse">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  {waitingCount} pendientes
                </span>
              )}
            </div>

            {/* Barra de Búsqueda */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre o teléfono..."
                className="w-full rounded-lg border border-line bg-ink/70 pl-9 pr-8 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
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

            {/* Filtros por Estado (Pills horizontales con scroll) */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
              <button
                onClick={() => setStatusFilter("all")}
                className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 ${
                  statusFilter === "all"
                    ? "bg-signal text-ink font-semibold"
                    : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                }`}
              >
                Todos ({conversations.length})
              </button>
              <button
                onClick={() => setStatusFilter("waiting_agent")}
                className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 flex items-center gap-1 ${
                  statusFilter === "waiting_agent"
                    ? "bg-amber-400 text-ink font-semibold"
                    : "bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                }`}
              >
                <span>Esperando</span>
                {waitingCount > 0 && (
                  <span className="rounded-full bg-amber-500/30 px-1.5 text-[10px]">
                    {waitingCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setStatusFilter("ai_active")}
                className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 ${
                  statusFilter === "ai_active"
                    ? "bg-emerald-400 text-ink font-semibold"
                    : "bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                }`}
              >
                IA Activa
              </button>
              <button
                onClick={() => setStatusFilter("human_takeover")}
                className={`rounded-lg px-2.5 py-1 font-medium transition shrink-0 ${
                  statusFilter === "human_takeover"
                    ? "bg-sky-400 text-ink font-semibold"
                    : "bg-sky-400/10 text-sky-300 hover:bg-sky-400/20"
                }`}
              >
                Asesor
              </button>
            </div>
          </div>

          {/* Lista scrolleable de chats */}
          <div className="flex-1 overflow-y-auto overscroll-contain p-2 sm:p-2.5 space-y-1.5">
            {loading ? (
              <div className="p-8 text-center text-sm text-slate-400">
                <div className="mx-auto size-6 animate-spin rounded-full border-2 border-signal border-t-transparent mb-2" />
                Cargando conversaciones...
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                <MessageSquare className="size-8 mx-auto text-slate-600 mb-2" />
                No se encontraron conversaciones
              </div>
            ) : (
              filteredConversations.map((chat) => {
                const contactName = chat.contacts?.name || chat.contacts?.phone || "Cliente";
                const isSelected = chat.id === selectedId;
                const statusInfo = getStatusLabel(chat.status);
                const initials = contactName.substring(0, 2).toUpperCase();

                return (
                  <button
                    key={chat.id}
                    onClick={() => {
                      setSelectedId(chat.id);
                      setMobileView("chat"); // En móvil abrir inmediatamente el chat
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition active:scale-[0.99] ${
                      isSelected
                        ? "border-signal/40 bg-signal/15 shadow-glow"
                        : "border-transparent bg-white/[0.02] hover:border-line hover:bg-white/[0.05]"
                    }`}
                  >
                    {/* Avatar con iniciales y Badge de Estado */}
                    <div className="relative shrink-0">
                      <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-sm font-bold text-white ring-1 ring-white/10">
                        {initials}
                      </span>
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-panel ${statusInfo.dotColor}`}
                      />
                    </div>

                    {/* Datos del chat */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-semibold text-white">
                          {contactName}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {chat.last_message_at ? formatMessageTime(chat.last_message_at) : ""}
                        </span>
                      </div>

                      <p className="mt-1 line-clamp-1 text-xs text-slate-400 leading-relaxed">
                        {chat.last_message_preview || "Sin mensajes recientes"}
                      </p>

                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.shortText}
                        </span>
                        {chat.status === "waiting_agent" && (
                          <span className="text-[10px] font-semibold text-amber-300">
                            ¡Requiere atención!
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* ============================================================== */}
        {/* COLUMNA 2: CHAT ACTIVO                                         */}
        {/* ============================================================== */}
        <section
          className={`flex-1 min-w-0 h-full flex-col bg-ink/40 xl:border-r border-line ${
            mobileView === "chat" ? "flex" : "hidden"
          } md:flex`}
        >
          {activeConversation ? (
            <>
              {/* Encabezado del Chat */}
              <div className="flex items-center justify-between border-b border-line bg-panel/90 px-3 py-2.5 sm:px-4 sm:py-3 z-10 shrink-0">
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                  {/* Botón Volver (solo en móvil) */}
                  <button
                    onClick={() => setMobileView("list")}
                    className="grid size-9 place-items-center rounded-lg border border-line bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 md:hidden transition active:scale-95 shrink-0"
                    aria-label="Volver a la lista de chats"
                  >
                    <ArrowLeft className="size-4" />
                  </button>

                  {/* Avatar e Identificación del Lead */}
                  <button
                    onClick={() => setShowMobileDetails(true)}
                    className="flex min-w-0 items-center gap-2.5 text-left group"
                  >
                    <span className="grid size-9 sm:size-10 place-items-center rounded-xl bg-signal/15 font-bold text-signal ring-1 ring-signal/30 shrink-0">
                      {(activeConversation.contacts?.name || "CL").substring(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm sm:text-base font-semibold text-white group-hover:text-signal transition">
                        {activeConversation.contacts?.name || activeConversation.contacts?.phone}
                      </h2>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`size-1.5 rounded-full ${getStatusLabel(activeConversation.status).dotColor}`}
                        />
                        <span className="text-[11px] text-slate-400 truncate">
                          {getStatusLabel(activeConversation.status).text}
                        </span>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Acciones del Encabezado */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {/* Botón Intervenir / Reactivar IA */}
                  <button
                    onClick={toggleStatus}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                      activeConversation.status === "ai_active"
                        ? "border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
                        : "border-signal/30 bg-signal/10 text-signal hover:bg-signal/20"
                    }`}
                  >
                    {activeConversation.status === "ai_active" ? (
                      <>
                        <Zap className="size-3.5" />
                        <span className="hidden sm:inline">Intervenir (Tomar control)</span>
                        <span className="sm:hidden">Intervenir</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="size-3.5" />
                        <span className="hidden sm:inline">Reactivar IA</span>
                        <span className="sm:hidden">Reactivar</span>
                      </>
                    )}
                  </button>

                  {/* Botón Info (abre Drawer en pantallas sin Columna 3) */}
                  <button
                    onClick={() => setShowMobileDetails(true)}
                    className="grid size-8 sm:size-9 place-items-center rounded-lg border border-line bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 xl:hidden transition active:scale-95"
                    aria-label="Ver detalles del contacto"
                  >
                    <Info className="size-4" />
                  </button>
                </div>
              </div>

              {/* Contenedor de Mensajes con Scroll Aislado */}
              <div
                ref={messagesContainerRef}
                className="flex-1 space-y-3.5 overflow-y-auto overscroll-contain p-3 sm:p-4 min-h-0"
              >
                {messages.length === 0 ? (
                  <div className="grid h-full place-items-center text-center text-slate-500 text-xs sm:text-sm">
                    <div>
                      <Bot className="size-8 mx-auto text-slate-600 mb-2" />
                      Inicia la conversación o espera el primer mensaje del cliente.
                    </div>
                  </div>
                ) : (
                  messages.map((message) => {
                    const isAgent = message.sender === "agent";
                    const isSystem = message.sender === "system";
                    const isBot = message.sender === "bot";

                    if (isSystem) {
                      return (
                        <div key={message.id} className="flex justify-center my-2">
                          <div className="max-w-[90%] rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-1.5 text-center text-[11px] sm:text-xs text-amber-200 shadow-sm leading-relaxed">
                            {message.content}
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={message.id}
                        className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-[72%] rounded-2xl border px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm leading-relaxed shadow-md break-words ${
                            isAgent
                              ? "rounded-tr-xs border-sky-400/30 bg-sky-500/20 text-sky-50 shadow-sky-950/20"
                              : isBot
                              ? "rounded-tl-xs border-signal/25 bg-signal/12 text-emerald-50 shadow-emerald-950/20"
                              : "rounded-tl-xs border-line bg-white/[0.08] text-slate-100 shadow-black/20"
                          }`}
                        >
                          {/* Identificador del Emisor */}
                          <div className="mb-1 flex items-center justify-between gap-3 text-[10px] sm:text-[11px] font-semibold text-slate-400">
                            <span className="flex items-center gap-1">
                              {isBot && <Bot className="size-3 text-signal" />}
                              {isAgent && <UserRound className="size-3 text-sky-300" />}
                              <span
                                className={
                                  isBot
                                    ? "text-signal"
                                    : isAgent
                                    ? "text-sky-300"
                                    : "text-slate-300"
                                }
                              >
                                {isBot ? "Bot IA" : isAgent ? "Tú (Asesor)" : "Cliente"}
                              </span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {formatMessageTime(message.created_at)}
                            </span>
                          </div>

                          {/* Contenido del Mensaje */}
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Barra de Entrada Pinned al fondo */}
              <div className="border-t border-line bg-panel/95 p-2.5 sm:p-3 shrink-0">
                {activeConversation.status === "ai_active" && (
                  <p className="mb-1.5 px-1 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400" />
                    El Bot está activo. Al responder tomarás el control manual como asesor.
                  </p>
                )}
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-ink/70 px-3 py-1.5 focus-within:border-signal/50 transition">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      placeholder={
                        activeConversation.status === "ai_active"
                          ? "Escribe para intervenir y responder..."
                          : "Escribe tu respuesta como asesor..."
                      }
                      className="min-w-0 flex-1 bg-transparent text-sm sm:text-sm text-white placeholder:text-slate-500 outline-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-signal font-semibold text-ink shadow-glow transition hover:bg-emerald-300 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Enviar mensaje"
                  >
                    {sending ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-slate-500">
              <div>
                <MessageSquarePlus className="size-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-base font-semibold text-slate-300">
                  Ninguna conversación seleccionada
                </h3>
                <p className="mt-1 text-xs text-slate-500 max-w-sm">
                  Selecciona un chat de la lista para ver los mensajes y responder a los clientes de Deploy.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* COLUMNA 3 (Desktop Amplio): INFORMACIÓN DEL LEAD                */}
        {/* ============================================================== */}
        <aside className="hidden h-full w-72 shrink-0 flex-col overflow-y-auto border-line bg-panel/75 p-5 xl:flex">
          {activeConversation ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-line bg-white/[0.04] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-12 place-items-center rounded-xl bg-signal/15 text-lg font-bold text-signal ring-1 ring-signal/30">
                    {(activeConversation.contacts?.name || "CL").substring(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-white">
                      {activeConversation.contacts?.name || "Cliente"}
                    </h2>
                    <p className="text-xs text-slate-400">WhatsApp Lead</p>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5 border-t border-line/50 pt-3 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Teléfono:</span>
                    <a
                      href={`tel:${activeConversation.contacts?.phone}`}
                      className="font-mono text-signal hover:underline"
                    >
                      {activeConversation.contacts?.phone || "Sin teléfono"}
                    </a>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="text-slate-500">Estado:</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        getStatusLabel(activeConversation.status).color
                      }`}
                    >
                      {getStatusLabel(activeConversation.status).text}
                    </span>
                  </div>
                </div>

                {/* Acciones directas */}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <a
                    href={`https://wa.me/${(activeConversation.contacts?.phone || "").replace(
                      /[^0-9]/g,
                      ""
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white/5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition"
                  >
                    <ExternalLink className="size-3.5 text-signal" />
                    Abrir WA
                  </a>
                  <button
                    onClick={toggleStatus}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white/5 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/10 transition"
                  >
                    <Zap className="size-3.5 text-amber-400" />
                    {activeConversation.status === "ai_active" ? "Tomar control" : "Activar IA"}
                  </button>
                </div>
              </div>

              {/* Notas del Asesor */}
              <div className="rounded-xl border border-line bg-white/[0.04] p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Notas del Asesor
                </h3>
                <textarea
                  value={advisorNotes[activeConversation.contact_id] || ""}
                  onChange={(e) =>
                    handleSaveNote(activeConversation.contact_id, e.target.value)
                  }
                  className="mt-3 min-h-36 w-full resize-none rounded-lg border border-line bg-ink/70 p-3 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-signal/50 transition"
                  placeholder="Escribe notas privadas sobre este cliente (requerimientos, presupuesto, etc.)..."
                />
                <p className="mt-1 text-[10px] text-slate-500 text-right">
                  Guardado automático local
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-500 mt-8">
              Selecciona un chat para ver los detalles del contacto
            </p>
          )}
        </aside>
      </div>

      {/* ============================================================== */}
      {/* DRAWER / BOTTOM SHEET EN MÓVIL: INFORMACIÓN DEL LEAD           */}
      {/* ============================================================== */}
      {showMobileDetails && activeConversation && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm lg:hidden animate-in fade-in duration-200">
          <div
            className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del Modal */}
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-semibold text-white">Detalles del Contacto</h3>
              <button
                onClick={() => setShowMobileDetails(false)}
                className="grid size-8 place-items-center rounded-lg bg-white/5 text-slate-400 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Datos del Contacto */}
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-xl bg-signal/15 text-lg font-bold text-signal ring-1 ring-signal/30">
                {(activeConversation.contacts?.name || "CL").substring(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <h4 className="truncate font-semibold text-white">
                  {activeConversation.contacts?.name || "Cliente WhatsApp"}
                </h4>
                <p className="font-mono text-xs text-signal">
                  {activeConversation.contacts?.phone}
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-line/50 pt-3 text-xs text-slate-300">
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Estado actual:</span>
                <span
                  className={`rounded-full border px-2 py-0.5 font-medium ${
                    getStatusLabel(activeConversation.status).color
                  }`}
                >
                  {getStatusLabel(activeConversation.status).text}
                </span>
              </div>
            </div>

            {/* Acciones directas para el Asesor en móvil */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <a
                href={`tel:${activeConversation.contacts?.phone}`}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white/5 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                <Phone className="size-3.5 text-signal" />
                Llamar
              </a>
              <a
                href={`https://wa.me/${(activeConversation.contacts?.phone || "").replace(
                  /[^0-9]/g,
                  ""
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-white/5 py-2.5 text-xs font-semibold text-white hover:bg-white/10 transition"
              >
                <ExternalLink className="size-3.5 text-emerald-400" />
                Abrir en WhatsApp
              </a>
            </div>

            {/* Conmutador de Asesor / IA */}
            <button
              onClick={() => {
                toggleStatus();
                setShowMobileDetails(false);
              }}
              className={`w-full flex items-center justify-center gap-2 rounded-lg border py-2.5 text-xs font-semibold transition ${
                activeConversation.status === "ai_active"
                  ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                  : "border-signal/30 bg-signal/10 text-signal"
              }`}
            >
              <Zap className="size-4" />
              {activeConversation.status === "ai_active"
                ? "Tomar control manual (Pausar IA)"
                : "Reactivar atención por IA"}
            </button>

            {/* Notas del Asesor */}
            <div className="border-t border-line/50 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Notas del Asesor
              </h4>
              <textarea
                value={advisorNotes[activeConversation.contact_id] || ""}
                onChange={(e) =>
                  handleSaveNote(activeConversation.contact_id, e.target.value)
                }
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-line bg-ink/70 p-3 text-xs text-slate-200 outline-none focus:border-signal/50 transition placeholder:text-slate-500"
                placeholder="Escribe notas sobre este cliente..."
              />
              <p className="mt-1 text-[10px] text-slate-500 text-right">
                Guardado automático
              </p>
            </div>

            <button
              onClick={() => setShowMobileDetails(false)}
              className="w-full rounded-lg bg-white/10 py-2.5 text-xs font-semibold text-white hover:bg-white/15 transition"
            >
              Volver al Chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
