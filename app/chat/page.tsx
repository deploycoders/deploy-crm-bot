"use client";

import { useEffect, useState, useRef } from "react";
import {
  Bot,
  Check,
  FileText,
  MessageSquarePlus,
  Paperclip,
  Phone,
  Send,
  ShieldCheck,
  UserRound,
  RotateCcw,
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

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === selectedId);

  // Auto-scroll al último mensaje
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
          setSelectedId(matched ? matched.id : data[0].id);
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

  // 3. Suscripción a Supabase Realtime (escuchar mensajes y cambios de conversación)
  useEffect(() => {
    const channel = supabase
      .channel("chat-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          // Si el mensaje pertenece a la conversación actual, lo agregamos en vivo
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => [...prev, newMsg]);
          }
          // Actualizamos la lista de conversaciones para refrescar la vista previa
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
    if (!inputText.trim() || !selectedId) return;

    const textToSend = inputText.trim();
    setInputText("");

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

      // Refrescar localmente
      fetchConversations();
      fetchMessages(selectedId);
    } catch (err: unknown) {
      console.error("Error al enviar mensaje:", err);
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

      // Notificación de sistema en el chat
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
        return { text: "Atendido por IA", color: "text-emerald-300 bg-emerald-400/10 border-emerald-400/20" };
      case "human_takeover":
        return { text: "Atendido por Humano", color: "text-sky-300 bg-sky-400/10 border-sky-400/20" };
      case "waiting_agent":
        return { text: "Esperando Asesor", color: "text-amber-300 bg-amber-400/10 border-amber-400/20" };
      case "resolved":
        return { text: "Resuelto", color: "text-slate-300 bg-slate-400/10 border-slate-400/20" };
      default:
        return { text: status, color: "text-slate-300 bg-white/10 border-line" };
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-7xl flex-col overflow-hidden rounded-lg border border-line bg-panel/72 shadow-2xl shadow-black/20 backdrop-blur-xl lg:h-[calc(100vh-4rem)]">
      <header className="flex flex-col gap-3 border-b border-line px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-signal">CRM Chat Live</p>
          <h1 className="text-2xl font-semibold text-white">Bandeja de Mensajes</h1>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          <ShieldCheck className="size-4" />
          {conversations.filter((c) => c.status === "waiting_agent").length} conversaciones requieren atención
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_340px]">
        {/* Columna Izquierda: Lista de Conversaciones */}
        <aside className="min-h-0 border-b border-line lg:border-b-0 lg:border-r">
          <div className="border-b border-line p-4">
            <div className="flex items-center gap-2 rounded-lg border border-line bg-ink/55 px-3 py-2 text-sm text-slate-400">
              <MessageSquarePlus className="size-4" />
              <span>Conversaciones activas</span>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto p-3 lg:max-h-none">
            {loading ? (
              <p className="p-4 text-center text-sm text-slate-500">Cargando chats...</p>
            ) : conversations.length === 0 ? (
              <p className="p-4 text-center text-sm text-slate-500">No hay conversaciones</p>
            ) : (
              conversations.map((chat) => {
                const contactName = chat.contacts?.name || chat.contacts?.phone || "Cliente";
                const isSelected = chat.id === selectedId;
                const statusInfo = getStatusLabel(chat.status);
                const initials = contactName.substring(0, 2).toUpperCase();

                return (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedId(chat.id)}
                    className={`mb-2 flex w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                      isSelected
                        ? "border-signal/30 bg-signal/10"
                        : "border-transparent hover:border-line hover:bg-white/[0.045]"
                    }`}
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/10 text-sm font-semibold text-white ring-1 ring-line">
                      {initials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-white">{contactName}</span>
                        {chat.status === "waiting_agent" && (
                          <span className="size-2.5 rounded-full bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.75)]" />
                        )}
                      </span>
                      <span className="mt-1 line-clamp-2 text-sm text-slate-400">
                        {chat.last_message_preview || "Sin mensajes"}
                      </span>
                      <span
                        className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusInfo.color}`}
                      >
                        {statusInfo.text}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Columna Central: Chat Activo */}
        <section className="flex min-h-[560px] min-w-0 flex-col border-b border-line lg:min-h-0 lg:border-b-0 lg:border-r">
          {activeConversation ? (
            <>
              {/* Encabezado del Chat */}
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 place-items-center rounded-lg bg-signal/12 font-semibold text-signal ring-1 ring-signal/25">
                    {(activeConversation.contacts?.name || "CL").substring(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold text-white">
                      {activeConversation.contacts?.name || activeConversation.contacts?.phone}
                    </h2>
                    <p className={`text-xs ${getStatusLabel(activeConversation.status).color.split(" ")[0]}`}>
                      {getStatusLabel(activeConversation.status).text}
                    </p>
                  </div>
                </div>

                {/* Botón de Intervención Humana */}
                <button
                  onClick={toggleStatus}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    activeConversation.status === "ai_active"
                      ? "border-amber-400/30 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
                      : "border-signal/30 bg-signal/10 text-signal hover:bg-signal/20"
                  }`}
                >
                  {activeConversation.status === "ai_active" ? (
                    <>
                      <Check className="size-4" />
                      Intervenir (Tomar control)
                    </>
                  ) : (
                    <>
                      <RotateCcw className="size-4" />
                      Reactivar IA
                    </>
                  )}
                </button>
              </div>

              {/* Mensajes en Tiempo Real */}
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {messages.map((message) => {
                  const isAgent = message.sender === "agent";
                  const isSystem = message.sender === "system";
                  const isBot = message.sender === "bot";

                  if (isSystem) {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-200">
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
                        className={`max-w-[82%] rounded-lg border px-4 py-3 text-sm leading-6 sm:max-w-[68%] ${
                          isAgent
                            ? "border-sky-300/20 bg-sky-500/18 text-sky-50"
                            : isBot
                            ? "border-signal/20 bg-signal/10 text-emerald-100"
                            : "border-line bg-white/[0.07] text-slate-100"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-400">
                          {isBot && <Bot className="size-3.5 text-signal" />}
                          {isAgent && <UserRound className="size-3.5 text-sky-200" />}
                          {isBot ? "Bot IA" : isAgent ? "Tú (Asesor)" : "Cliente"}
                        </div>
                        {message.content}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input para responder */}
              <form onSubmit={handleSendMessage} className="border-t border-line p-4">
                <div className="flex items-center gap-2 rounded-lg border border-line bg-ink/65 p-2">
                  <input
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    className="min-w-0 flex-1 bg-transparent px-2 text-sm text-white outline-none placeholder:text-slate-500"
                    placeholder={
                      activeConversation.status === "ai_active"
                        ? "Escribe un mensaje para responder e intervenir..."
                        : "Escribe tu respuesta como asesor..."
                    }
                  />
                  <button
                    type="submit"
                    className="grid size-10 place-items-center rounded-lg bg-signal text-ink transition hover:bg-emerald-300"
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-slate-500">
              Selecciona una conversación para ver los mensajes.
            </div>
          )}
        </section>

        {/* Columna Derecha: Información del Lead */}
        <aside className="min-h-0 overflow-y-auto p-5">
          {activeConversation ? (
            <>
              <div className="rounded-lg border border-line bg-white/[0.045] p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-14 place-items-center rounded-lg bg-signal/10 text-lg font-semibold text-signal ring-1 ring-signal/25">
                    {(activeConversation.contacts?.name || "CL").substring(0, 2).toUpperCase()}
                  </span>
                  <div>
                    <h2 className="font-semibold text-white">
                      {activeConversation.contacts?.name || "Cliente"}
                    </h2>
                    <p className="text-sm text-slate-400">Contacto WhatsApp</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-slate-300">
                    <Phone className="size-4 text-slate-500" />
                    {activeConversation.contacts?.phone || "Sin teléfono"}
                  </div>
                  <div className="flex items-center gap-3 text-slate-300">
                    <Bot className="size-4 text-slate-500" />
                    Estado: {getStatusLabel(activeConversation.status).text}
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-line bg-white/[0.045] p-4">
                <h3 className="font-semibold text-white">Notas del Asesor</h3>
                <textarea
                  className="mt-3 min-h-32 w-full resize-none rounded-lg border border-line bg-ink/60 p-3 text-sm text-slate-200 outline-none placeholder:text-slate-500"
                  placeholder="Agregar notas sobre este prospecto..."
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Sin datos de contacto</p>
          )}
        </aside>
      </div>
    </div>
  );
}
