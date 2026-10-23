"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bot,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquare,
  MessageSquarePlus,
  Paperclip,
  Phone,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Tag,
  UserRound,
  X,
  Zap,
  RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { cleanJsonArtifacts } from "@/lib/ai";
import { getQuickReplies, QuickReply } from "@/lib/quickReplies";
import { CRM_TAGS, getAllTagsMap, toggleLeadTag } from "@/lib/tags";
import {
  CRM_AGENTS,
  CRMAgent,
  getAllAgents,
  getAllAssignmentsMap,
  assignLeadAgent,
  getAgentById,
} from "@/lib/agents";
import {
  notifyIncomingMessage,
  notifyHandoff,
  isPushEnabled,
} from "@/lib/notifications";
import { createAuditor } from "@/lib/audit";
import { useAuth } from "@/context/AuthContext";
import { rateLimit, resetRateLimit } from "@/lib/permissions";

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

// Datos de demostración y fallback cuando Supabase no está conectado o falla la red
const DEMO_CHAT_CONVERSATIONS: Conversation[] = [
  {
    id: "demo-1",
    contact_id: "contact-1",
    channel: "whatsapp",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    last_message_preview: "Hola",
    unread_count: 0,
    contacts: {
      id: "contact-1",
      name: "Ing Jesús Pichardo",
      phone: "+584124811691",
    },
  },
  {
    id: "demo-2",
    contact_id: "contact-2",
    channel: "whatsapp",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    last_message_preview: "¡Saludos! Un gusto saludarte de nuevo.",
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
    channel: "whatsapp",
    status: "waiting_agent",
    last_message_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    last_message_preview: "Hola! Muy buenos días. Necesito cotización para bot...",
    unread_count: 1,
    contacts: {
      id: "contact-3",
      name: "José Colmenarez",
      phone: "+555195098805",
    },
  },
  {
    id: "demo-4",
    contact_id: "contact-4",
    channel: "whatsapp",
    status: "ai_active",
    last_message_at: new Date(Date.now() - 72 * 3600 * 1000).toISOString(),
    last_message_preview: "Hola! Para crear una Card en Kotlin...",
    unread_count: 0,
    contacts: {
      id: "contact-4",
      name: "Jesús Rivero",
      phone: "+584145414202",
    },
  },
  {
    id: "demo-5",
    contact_id: "contact-5",
    channel: "whatsapp",
    status: "waiting_agent",
    last_message_at: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
    last_message_preview: "Lamento el inconveniente con la activación...",
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
    channel: "whatsapp",
    status: "human_takeover",
    last_message_at: new Date(Date.now() - 120 * 3600 * 1000).toISOString(),
    last_message_preview: "Atendido por asesor comercial",
    unread_count: 0,
    contacts: {
      id: "contact-6",
      name: "Cliente VIP Corp",
      phone: "+584241234567",
    },
  },
];

const DEMO_CHAT_MESSAGES: Record<string, Message[]> = {
  "demo-1": [
    {
      id: "msg-1-1",
      conversation_id: "demo-1",
      sender: "client",
      content: "Hola buenas tardes",
      created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: "msg-1-2",
      conversation_id: "demo-1",
      sender: "bot",
      content: "¡Hola! 👋 Bienvenido a Deploy. ¿En qué servicio o consulta tecnológica te podemos ayudar hoy?\n\n1️⃣ FAQ\n2️⃣ Servicios\n3️⃣ Soporte\n4️⃣ Hablar con un Asesor",
      created_at: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
    },
    {
      id: "msg-1-3",
      conversation_id: "demo-1",
      sender: "client",
      content: "Hola",
      created_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    },
  ],
  "demo-3": [
    {
      id: "msg-3-1",
      conversation_id: "demo-3",
      sender: "client",
      content: "Hola! Quisiera cotizar un chatbot de atención para mi empresa",
      created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    },
    {
      id: "msg-3-2",
      conversation_id: "demo-3",
      sender: "system",
      content: JSON.stringify({
        type: "handoff_summary_card",
        executiveSummary: "El cliente busca cotizar un chatbot con IA para atención comercial y automatización de respuestas.",
        clientInterest: "Chatbot de WhatsApp con IA",
        urgencyLevel: "alta",
        recommendedAction: "Presentar opciones de desarrollo de bot, solicitar requerimientos de flujo y ofrecer reunión de diagnóstico.",
        reason: "Solicitud de Cotización",
      }),
      created_at: new Date(Date.now() - 47 * 3600 * 1000).toISOString(),
    },
  ],
};

export default function ChatPage() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>(DEMO_CHAT_CONVERSATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Auditor pre-configurado con el usuario actual
  const audit = createAuditor(
    user?.id ?? "unknown",
    user?.name ?? "Asesor"
  );

  // Mobile state navigation: "list" (lista de chats) o "chat" (chat activo)
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  // Sheet modal de información del contacto en móvil
  const [showMobileDetails, setShowMobileDetails] = useState(false);

  // Filtros y búsqueda
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");

  // Notas del asesor por contacto (guardadas en localStorage)
  const [advisorNotes, setAdvisorNotes] = useState<Record<string, string>>({});

  // Etiquetas de Leads (CRM Tags)
  const [leadTagsMap, setLeadTagsMap] = useState<Record<string, string[]>>({});

  // Asignaciones de Asesor por lead (guardadas en localStorage)
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, string>>({});
  const [showAgentPicker, setShowAgentPicker] = useState(false);

  // Respuestas Rápidas (Snippets y Atajos con /)
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [showQuickRepliesMenu, setShowQuickRepliesMenu] = useState(false);

  // Modal / Envío de Multimedia (Imágenes y Documentos/PDF)
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [mediaType, setMediaType] = useState<"image" | "document">("image");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaFilename, setMediaFilename] = useState("");
  const [mediaCaption, setMediaCaption] = useState("");
  const [sendingMedia, setSendingMedia] = useState(false);

  // Control de scroll y visibilidad de botones
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConversation = conversations.find((c) => c.id === selectedId);

  // Estado para la generación manual o automática del resumen
  const [generatingSummary, setGeneratingSummary] = useState(false);

  // Extraer el último resumen ejecutivo de la conversación (si existe en los mensajes)
  const currentHandoffSummary = useMemo(() => {
    if (!messages || messages.length === 0) return null;
    const summaryMsg = [...messages].reverse().find(
      (m) =>
        m.sender === "system" &&
        m.content.startsWith("{") &&
        m.content.includes("handoff_summary_card")
    );
    if (!summaryMsg) return null;
    try {
      return JSON.parse(summaryMsg.content);
    } catch {
      return null;
    }
  }, [messages]);

  // Cargar respuestas rápidas
  useEffect(() => {
    setQuickReplies(getQuickReplies());
  }, []);

  // Comprobar si la conversación está fuera de la ventana de 24 horas de Meta
  const isOutside24HoursWindow = useMemo(() => {
    if (!activeConversation || !activeConversation.last_message_at) return false;
    const lastMsgTime = new Date(activeConversation.last_message_at).getTime();
    const now = Date.now();
    const hoursDifference = (now - lastMsgTime) / (1000 * 60 * 60);
    return hoursDifference > 24;
  }, [activeConversation]);

  // Detectar la posición del scroll para mostrar botones de ayuda
  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Si el usuario subió y está a más de 80px del fondo, mostrar botón para bajar
    setShowScrollBottom(distanceToBottom > 80);
    // Si ha bajado más de 250px del inicio, mostrar botón para subir
    setShowScrollTop(el.scrollTop > 250);
  };

  // Scroll suave al fondo (donde están los mensajes recientes y el input)
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  // Scroll al comienzo del chat (primeros mensajes)
  const scrollToTop = (behavior: ScrollBehavior = "smooth") => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: 0,
        behavior,
      });
    }
  };

  // Bajar al final y enfocar la caja de respuesta
  const handleScrollToBottomAndFocus = () => {
    scrollToBottom("smooth");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cargar notas y tags desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("crm_advisor_notes");
      if (saved) {
        setAdvisorNotes(JSON.parse(saved));
      }
    } catch {
      // Ignorar si no está disponible
    }
    setLeadTagsMap(getAllTagsMap());
    setAssignmentsMap(getAllAssignmentsMap());
  }, []);

  const handleToggleTag = (contactId: string, tagId: string) => {
    const updated = toggleLeadTag(contactId, tagId);
    setLeadTagsMap((prev) => ({ ...prev, [contactId]: updated }));
  };

  const handleAssignAgent = (contactId: string, agentId: string) => {
    assignLeadAgent(contactId, agentId);
    setAssignmentsMap((prev) => ({ ...prev, [contactId]: agentId }));
    setShowAgentPicker(false);
  };

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
        console.warn("Aviso al consultar Supabase (usando datos locales de respaldo):", error.message);
      } else if (data && data.length > 0) {
        setConversations(data as Conversation[]);
      }

      // Si no hay id seleccionado, fijar el inicial
      const currentList = (data && data.length > 0) ? (data as Conversation[]) : DEMO_CHAT_CONVERSATIONS;
      if (!selectedId && currentList.length > 0) {
        const urlParamId =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("id")
            : null;
        const matched = currentList.find((c) => c.id === urlParamId);
        if (matched) {
          setSelectedId(matched.id);
          setMobileView("chat");
        } else if (typeof window !== "undefined" && window.innerWidth >= 1024) {
          setSelectedId(currentList[0].id);
        }
      }
    } catch (err: any) {
      console.warn("Error de conexión con Supabase (Failed to fetch). Operando en modo local resiliente:", err?.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Cargar mensajes de la conversación activa
  const fetchMessages = async (convId: string) => {
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      if (error) {
        console.warn("Aviso al cargar mensajes de Supabase:", error.message);
        if (DEMO_CHAT_MESSAGES[convId]) {
          setMessages(DEMO_CHAT_MESSAGES[convId]);
        }
        return;
      }

      if (data && data.length > 0) {
        setMessages(data as Message[]);
      } else if (DEMO_CHAT_MESSAGES[convId]) {
        setMessages(DEMO_CHAT_MESSAGES[convId]);
      } else {
        setMessages([]);
      }
    } catch (err: any) {
      console.warn("Error de conexión al obtener mensajes (usando demo si existe):", err?.message);
      if (DEMO_CHAT_MESSAGES[convId]) {
        setMessages(DEMO_CHAT_MESSAGES[convId]);
      }
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
          // Notificación push si el mensaje es del cliente y no es la conv activa
          if (
            newMsg.sender === "client" &&
            newMsg.conversation_id !== selectedId
          ) {
            const conv = conversations.find(
              (c) => c.id === newMsg.conversation_id
            );
            const contactName =
              conv?.contacts?.name || conv?.contacts?.phone || "Cliente";
            const preview = newMsg.content?.slice(0, 80) || "Nuevo mensaje";
            notifyIncomingMessage(contactName, preview, newMsg.conversation_id);
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
          // Notificación push si una conv pasó a waiting_agent
          if (updatedConv.status === "waiting_agent") {
            const conv = conversations.find((c) => c.id === updatedConv.id);
            const contactName =
              conv?.contacts?.name || conv?.contacts?.phone || "Lead";
            notifyHandoff(contactName, updatedConv.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedId, conversations]);

  // 4. Enviar mensaje como asesor humano
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedId || sending) return;

    // Rate limiting cliente (anti-doble-click)
    const rlKey = `send:${selectedId}`;
    if (!rateLimit(rlKey, 800)) return;

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
          agentId: user?.id ?? "unknown",
          agentName: user?.name ?? "Asesor",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error("Error al enviar mensaje vía API:", errData);
        resetRateLimit(rlKey); // Permitir retry inmediato si falla
      } else {
        // Auditar el envío
        audit("agent:message_sent", {
          conversationId: selectedId,
          metadata: { preview: textToSend.slice(0, 80) },
        });
      }

      await fetchMessages(selectedId);
      await fetchConversations();
    } catch (err: unknown) {
      console.error("Error al enviar mensaje:", err);
      resetRateLimit(rlKey);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Seleccionar e insertar una respuesta rápida
  const handleSelectQuickReply = (reply: QuickReply) => {
    setInputText(reply.text);
    setShowQuickRepliesMenu(false);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Enviar multimedia (Imagen o Documento) por WhatsApp
  const handleSendMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mediaUrl.trim() || !selectedId || sendingMedia) return;

    setSendingMedia(true);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selectedId,
          type: mediaType,
          mediaUrl: mediaUrl.trim(),
          filename: mediaFilename.trim() || undefined,
          text: mediaCaption.trim() || undefined,
        }),
      });

      if (res.ok) {
        setShowMediaModal(false);
        setMediaUrl("");
        setMediaCaption("");
        setMediaFilename("");
        await fetchMessages(selectedId);
        await fetchConversations();
      } else {
        alert("Error al enviar archivo por WhatsApp");
      }
    } catch (err) {
      console.error("Error enviando media:", err);
    } finally {
      setSendingMedia(false);
    }
  };

  // 5. Conmutar estado de intervención humana / IA
  const toggleStatus = async () => {
    if (!activeConversation) return;

    const newStatus =
      activeConversation.status === "ai_active" ? "human_takeover" : "ai_active";

    try {
      // Actualizar estado localmente de inmediato para que la interfaz responda al instante
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id ? { ...c, status: newStatus } : c
        )
      );

      // Intentar persistir en Supabase si está disponible (asíncrono protegido)
      (async () => {
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
        } catch {
          // Ignorar si la red de Supabase está offline
        }
      })();

      // Auditar el cambio de estado
      audit(
        newStatus === "human_takeover" ? "agent:takeover" : "agent:handover_to_ai",
        {
          conversationId: activeConversation.id,
          contactId: activeConversation.contact_id,
          metadata: { previousStatus: activeConversation.status, newStatus },
        }
      );

      // Si el asesor toma el control, generar automáticamente el resumen ejecutivo con IA
      if (newStatus === "human_takeover") {
        handleGenerateSummary(activeConversation.id);
      }
    } catch (err) {
      console.warn("Aviso al cambiar estado (aplicado localmente):", err);
    }
  };

  // Función para generar o regenerar el resumen ejecutivo de la conversación
  const handleGenerateSummary = async (convId?: string) => {
    const targetId = convId || activeConversation?.id;
    if (!targetId || generatingSummary) return;

    try {
      setGeneratingSummary(true);
      const res = await fetch("/api/chat/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: targetId,
          reason: "Atención por Asesor Humano",
        }),
      });

      if (res.ok) {
        await fetchMessages(targetId);
        await fetchConversations();
      }
    } catch (err) {
      console.error("Error al generar resumen:", err);
    } finally {
      setGeneratingSummary(false);
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
    <div className="h-[calc(100dvh-4rem)] p-2 sm:p-3 md:p-4 flex flex-col overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel/85 shadow-2xl backdrop-blur-xl">
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

                      {/* Badges de etiquetas asignadas */}
                      {leadTagsMap[chat.contact_id] && leadTagsMap[chat.contact_id].length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {leadTagsMap[chat.contact_id].map((tagId) => {
                            const tagDef = CRM_TAGS.find((t) => t.id === tagId);
                            if (!tagDef) return null;
                            return (
                              <span
                                key={tagDef.id}
                                className={`rounded px-1.5 py-0.5 text-[9px] font-medium border ${tagDef.bgClass} ${tagDef.textClass} ${tagDef.borderClass}`}
                              >
                                {tagDef.name}
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Badge de asesor asignado */}
                      {assignmentsMap[chat.contact_id] && assignmentsMap[chat.contact_id] !== "unassigned" && (() => {
                        const agent = getAgentById(assignmentsMap[chat.contact_id]);
                        return (
                          <div className="mt-1 flex items-center gap-1">
                            <span className={`text-[9px] font-medium ${agent.textClass}`}>
                              {agent.avatar}
                            </span>
                            <span className="text-[9px] text-slate-500">{agent.name}</span>
                          </div>
                        );
                      })()}
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
                  {/* Botones de Navegación Rápida de Mensajes */}
                  <div className="flex items-center rounded-lg border border-line bg-white/5 p-0.5">
                    <button
                      onClick={() => scrollToTop("smooth")}
                      className="grid size-7 sm:size-8 place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition"
                      title="Ir al comienzo del chat (primeros mensajes)"
                      aria-label="Ir al comienzo del chat"
                    >
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      onClick={handleScrollToBottomAndFocus}
                      className="grid size-7 sm:size-8 place-items-center rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition"
                      title="Bajar al final del chat (escribir respuesta)"
                      aria-label="Bajar al final del chat"
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </div>

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

              {/* Contenedor de Mensajes con Scroll Aislado y Botones Flotantes */}
              <div className="relative flex-1 min-h-0 flex flex-col overflow-hidden">
                <div
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
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
                        let handoffCardData: any = null;
                        try {
                          if (message.content.startsWith("{") && message.content.includes("handoff_summary_card")) {
                            handoffCardData = JSON.parse(message.content);
                          }
                        } catch {}

                        if (handoffCardData) {
                          const urgencyBadge = {
                            alta: "bg-rose-500/20 border-rose-500/40 text-rose-300",
                            media: "bg-amber-500/20 border-amber-500/40 text-amber-300",
                            baja: "bg-sky-500/20 border-sky-500/40 text-sky-300",
                          }[handoffCardData.urgencyLevel as "alta" | "media" | "baja"] || "bg-amber-500/20 border-amber-500/40 text-amber-300";

                          return (
                            <div key={message.id} className="flex justify-center my-3 px-2">
                              <div className="w-full max-w-xl rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-panel to-panel p-4 shadow-2xl backdrop-blur-md space-y-2.5">
                                <div className="flex items-center justify-between border-b border-amber-400/20 pb-2.5">
                                  <div className="flex items-center gap-2">
                                    <span className="grid size-7 place-items-center rounded-lg bg-amber-400/20 text-amber-400 border border-amber-400/30">
                                      <Sparkles className="size-4" />
                                    </span>
                                    <div>
                                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                                        Ficha Ejecutiva de Transferencia (IA)
                                      </h4>
                                      <p className="text-[10px] text-slate-400">
                                        Análisis automático previo a la intervención humana
                                      </p>
                                    </div>
                                  </div>
                                  <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase ${urgencyBadge}`}>
                                    Urgencia {handoffCardData.urgencyLevel || "Media"}
                                  </span>
                                </div>

                                <div className="space-y-2 text-xs text-slate-200">
                                  <div className="rounded-lg bg-ink/60 p-2.5 border border-line">
                                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">Resumen del Lead</p>
                                    <p className="text-xs text-slate-100 mt-0.5 leading-relaxed">
                                      {handoffCardData.executiveSummary}
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                    <div className="rounded-lg bg-ink/40 p-2 border border-line">
                                      <span className="text-slate-400">Interés:</span>{" "}
                                      <span className="text-amber-200 font-medium">{handoffCardData.clientInterest}</span>
                                    </div>
                                    <div className="rounded-lg bg-ink/40 p-2 border border-line">
                                      <span className="text-slate-400">Motivo:</span>{" "}
                                      <span className="text-slate-300 font-medium">{handoffCardData.reason}</span>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-200 flex items-start gap-2">
                                    <Zap className="size-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                      <span className="font-bold text-amber-300">Acción sugerida para el Asesor:</span>
                                      <p className="mt-0.5 text-slate-200">{handoffCardData.recommendedAction}</p>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        }

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
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500 font-normal">
                                  {formatMessageTime(message.created_at)}
                                </span>
                                {isAgent && (
                                  <span title="Entregado por WhatsApp" className="text-sky-300 inline-flex items-center">
                                    <CheckCheck className="size-3 text-sky-400" />
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Contenido del Mensaje limpio de artefactos JSON si los hubiera */}
                            <p className="whitespace-pre-wrap">{cleanJsonArtifacts(message.content)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Botón Flotante para Bajar al Chat / Responder */}
                {showScrollBottom && (
                  <div className="absolute bottom-3 right-4 z-20">
                    <button
                      type="button"
                      onClick={handleScrollToBottomAndFocus}
                      className="flex items-center gap-1.5 rounded-full border border-signal/50 bg-panel/95 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-signal shadow-2xl transition hover:bg-signal hover:text-ink active:scale-95 animate-in fade-in slide-in-from-bottom-2 duration-150"
                      title="Bajar al final del chat para responder"
                    >
                      <ArrowDown className="size-3.5 animate-bounce" />
                      <span>Bajar al chat</span>
                    </button>
                  </div>
                )}

                {/* Botón Flotante para Subir al Comienzo del Chat */}
                {showScrollTop && !showScrollBottom && (
                  <div className="absolute top-3 right-4 z-20">
                    <button
                      type="button"
                      onClick={() => scrollToTop("smooth")}
                      className="flex items-center gap-1.5 rounded-full border border-line bg-panel/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-medium text-slate-300 shadow-xl transition hover:bg-white/10 hover:text-white active:scale-95"
                      title="Subir al comienzo de la conversación"
                    >
                      <ArrowUp className="size-3" />
                      <span>Comienzo del chat</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Barra de Entrada Pinned al fondo */}
              {/* Barra de Entrada Pinned al fondo */}
              <div className="relative border-t border-line bg-panel/95 p-2.5 sm:p-3 shrink-0">
                {/* Popover Flotante de Respuestas Rápidas */}
                {showQuickRepliesMenu && (
                  <div className="absolute bottom-16 left-3 right-3 sm:left-4 sm:right-auto sm:w-96 rounded-2xl border border-signal/40 bg-panel/95 p-3 shadow-2xl backdrop-blur-xl z-30 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
                    <div className="flex items-center justify-between border-b border-line pb-2">
                      <div className="flex items-center gap-1.5">
                        <Zap className="size-3.5 text-amber-400" />
                        <span className="text-xs font-bold text-white">Respuestas Rápidas (Snippets)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowQuickRepliesMenu(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
                      {quickReplies.map((qr) => (
                        <button
                          key={qr.id}
                          type="button"
                          onClick={() => handleSelectQuickReply(qr)}
                          className="w-full text-left rounded-xl border border-line/60 bg-ink/60 p-2.5 hover:border-signal/50 hover:bg-white/5 transition group"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white group-hover:text-signal transition">
                              {qr.title}
                            </span>
                            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-signal font-semibold">
                              {qr.shortcut}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-400 leading-snug">
                            {qr.text}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Alerta de Ventana de 24 Horas de WhatsApp */}
                {isOutside24HoursWindow && (
                  <div className="mb-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] text-amber-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <AlertCircle className="size-3.5 text-amber-400 shrink-0" />
                      <span>⚠️ Fuera de ventana de 24h de WhatsApp. El cliente debe escribir o debes enviar una plantilla.</span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setInputText(
                          "¡Hola! Un gusto saludarte nuevamente desde Deploy 🚀. ¿En qué podemos colaborar con tu proyecto hoy?"
                        )
                      }
                      className="text-[10px] font-bold underline text-amber-300 hover:text-white shrink-0 ml-2"
                    >
                      Cargar Saludo
                    </button>
                  </div>
                )}

                {activeConversation.status === "ai_active" && (
                  <p className="mb-1.5 px-1 text-[11px] text-amber-300/90 flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400" />
                    El Bot está activo. Al responder tomarás el control manual como asesor.
                  </p>
                )}

                <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 sm:gap-2">
                  {/* Botón Respuestas Rápidas ⚡ */}
                  <button
                    type="button"
                    onClick={() => setShowQuickRepliesMenu(!showQuickRepliesMenu)}
                    className={`grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl border transition active:scale-95 ${
                      showQuickRepliesMenu
                        ? "border-amber-400 bg-amber-400/20 text-amber-300 shadow-glow"
                        : "border-line bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                    title="Respuestas Rápidas (Atajos con /)"
                    aria-label="Abrir respuestas rápidas"
                  >
                    <Zap className="size-4 text-amber-400" />
                  </button>

                  {/* Botón Adjuntar Multimedia 📎 */}
                  <button
                    type="button"
                    onClick={() => setShowMediaModal(true)}
                    className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl border border-line bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 transition active:scale-95"
                    title="Enviar Imagen o Documento PDF"
                    aria-label="Adjuntar archivo multimedia"
                  >
                    <Paperclip className="size-4" />
                  </button>

                  {/* Input de Texto */}
                  <div className="flex min-w-0 flex-1 items-center rounded-xl border border-line bg-ink/70 px-3 py-1.5 focus-within:border-signal/50 transition">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputText}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInputText(val);
                        if (val.startsWith("/")) {
                          setShowQuickRepliesMenu(true);
                        } else if (showQuickRepliesMenu && !val.includes("/")) {
                          setShowQuickRepliesMenu(false);
                        }
                      }}
                      placeholder={
                        activeConversation.status === "ai_active"
                          ? "Escribe para intervenir o '/' para respuestas rápidas..."
                          : "Escribe tu respuesta o '/' para snippets..."
                      }
                      className="min-w-0 flex-1 bg-transparent text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none"
                    />
                  </div>

                  {/* Botón Enviar */}
                  <button
                    type="submit"
                    disabled={!inputText.trim() || sending}
                    className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl bg-signal font-semibold text-ink shadow-glow transition hover:bg-emerald-300 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
                    aria-label="Enviar mensaje"
                  >
                    {sending ? (
                      <div className="size-4 animate-spin rounded-full border-2 border-ink border-t-transparent" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </button>
                </form>

                {/* Modal para Enviar Archivo Multimedia */}
                {showMediaModal && (
                  <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
                    <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-5 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between border-b border-line pb-3">
                        <div className="flex items-center gap-2">
                          <Paperclip className="size-4 text-signal" />
                          <h3 className="text-sm font-bold text-white">Enviar Archivo a WhatsApp</h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMediaModal(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      <form onSubmit={handleSendMedia} className="space-y-3 text-xs">
                        {/* Selector de Tipo: Imagen o Documento */}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setMediaType("image")}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 font-semibold transition ${
                              mediaType === "image"
                                ? "border-signal bg-signal/15 text-signal"
                                : "border-line bg-white/5 text-slate-400 hover:text-white"
                            }`}
                          >
                            <ImageIcon className="size-4" />
                            <span>Imagen (JPG/PNG)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMediaType("document")}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2 font-semibold transition ${
                              mediaType === "document"
                                ? "border-signal bg-signal/15 text-signal"
                                : "border-line bg-white/5 text-slate-400 hover:text-white"
                            }`}
                          >
                            <FileText className="size-4" />
                            <span>Documento (PDF)</span>
                          </button>
                        </div>

                        {/* URL del archivo */}
                        <div className="space-y-1">
                          <label className="text-slate-300 font-medium">URL pública del archivo</label>
                          <input
                            type="url"
                            required
                            value={mediaUrl}
                            onChange={(e) => setMediaUrl(e.target.value)}
                            placeholder={
                              mediaType === "image"
                                ? "https://ejemplo.com/cotizacion.jpg"
                                : "https://ejemplo.com/propuesta.pdf"
                            }
                            className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-signal/50"
                          />
                        </div>

                        {/* Nombre del archivo (solo si es documento) */}
                        {mediaType === "document" && (
                          <div className="space-y-1">
                            <label className="text-slate-300 font-medium">Nombre del archivo</label>
                            <input
                              type="text"
                              value={mediaFilename}
                              onChange={(e) => setMediaFilename(e.target.value)}
                              placeholder="Propuesta_Comercial_Deploy.pdf"
                              className="w-full rounded-xl border border-line bg-ink/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-signal/50"
                            />
                          </div>
                        )}

                        {/* Mensaje o Pie de Foto (Caption) */}
                        <div className="space-y-1">
                          <label className="text-slate-300 font-medium">Mensaje adjunto (opcional)</label>
                          <textarea
                            rows={2}
                            value={mediaCaption}
                            onChange={(e) => setMediaCaption(e.target.value)}
                            placeholder="Adjunto la propuesta solicitada para tu revisión..."
                            className="w-full rounded-xl border border-line bg-ink/70 p-2.5 text-white placeholder:text-slate-500 outline-none focus:border-signal/50 resize-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-line">
                          <button
                            type="button"
                            onClick={() => setShowMediaModal(false)}
                            className="rounded-xl border border-line bg-white/5 px-4 py-2 font-medium text-slate-300 hover:bg-white/10"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            disabled={!mediaUrl.trim() || sendingMedia}
                            className="rounded-xl bg-signal px-4 py-2 font-bold text-ink hover:bg-emerald-300 transition disabled:opacity-50"
                          >
                            {sendingMedia ? "Enviando..." : "Enviar a WhatsApp"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
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

              {/* Tarjeta Fija de Resumen del Lead / Conversación Tomada */}
              <div className="rounded-xl border border-amber-400/40 bg-gradient-to-br from-amber-500/10 via-panel to-panel p-4 shadow-lg space-y-3">
                <div className="flex items-center justify-between border-b border-amber-400/20 pb-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="size-4 text-amber-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                      Resumen del Lead
                    </h3>
                  </div>
                  <button
                    onClick={() => handleGenerateSummary()}
                    disabled={generatingSummary}
                    title="Actualizar resumen con IA"
                    className="flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/20 transition disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`size-3 ${generatingSummary ? "animate-spin" : ""}`} />
                    <span>{generatingSummary ? "Analizando..." : "Actualizar"}</span>
                  </button>
                </div>

                {currentHandoffSummary ? (
                  <div className="space-y-2 text-xs">
                    <div className="rounded-lg bg-ink/70 p-2.5 border border-line/80">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                        Síntesis de la Conversación
                      </p>
                      <p className="text-xs text-slate-100 leading-relaxed">
                        {currentHandoffSummary.executiveSummary}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg bg-ink/50 p-2 border border-line">
                        <span className="text-[10px] text-slate-400 block">Interés:</span>
                        <span className="text-amber-200 font-medium truncate block">
                          {currentHandoffSummary.clientInterest}
                        </span>
                      </div>
                      <div className="rounded-lg bg-ink/50 p-2 border border-line">
                        <span className="text-[10px] text-slate-400 block">Urgencia:</span>
                        <span className="text-xs font-semibold capitalize text-amber-300">
                          {currentHandoffSummary.urgencyLevel || "Media"}
                        </span>
                      </div>
                    </div>

                    {currentHandoffSummary.recommendedAction && (
                      <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-2 text-[11px] text-amber-200">
                        <span className="font-bold text-amber-300 block text-[10px] uppercase tracking-wider">
                          Acción sugerida para el asesor:
                        </span>
                        <p className="mt-0.5 text-slate-200 leading-snug">
                          {currentHandoffSummary.recommendedAction}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-line/70 bg-ink/30 p-3 text-center">
                    <p className="text-[11px] text-slate-400">
                      {generatingSummary
                        ? "Generando ficha ejecutiva con IA..."
                        : "Aún no se ha generado una ficha ejecutiva para este chat."}
                    </p>
                    <button
                      onClick={() => handleGenerateSummary()}
                      disabled={generatingSummary}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/25 transition disabled:opacity-50 cursor-pointer"
                    >
                      <Sparkles className="size-3 text-amber-400" />
                      <span>Generar Ficha Ahora</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Asesor Asignado */}
              <div className="rounded-xl border border-line bg-white/[0.04] p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <UserRound className="size-3.5 text-signal" />
                    Asesor Asignado
                  </h3>
                  <button
                    onClick={() => setShowAgentPicker((v) => !v)}
                    className="text-[10px] text-slate-500 hover:text-signal transition"
                  >
                    {showAgentPicker ? "Cerrar" : "Cambiar"}
                  </button>
                </div>

                {/* Asesor actual */}
                {(() => {
                  const agentId = assignmentsMap[activeConversation.contact_id] || "unassigned";
                  const agent = getAgentById(agentId);
                  return (
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${agent.bgClass} ${agent.borderClass}`}
                    >
                      <span className={`text-xs font-bold ${agent.textClass}`}>
                        {agent.avatar}
                      </span>
                      <div className="min-w-0">
                        <p className={`text-xs font-semibold ${agent.textClass}`}>
                          {agent.name}
                        </p>
                        <p className="text-[10px] text-slate-500">{agent.role}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Selector de asesor */}
                {showAgentPicker && (
                  <div className="mt-2 space-y-1">
                    {getAllAgents().map((agent) => {
                      const isCurrent =
                        (assignmentsMap[activeConversation.contact_id] || "unassigned") === agent.id;
                      return (
                        <button
                          key={agent.id}
                          onClick={() =>
                            handleAssignAgent(activeConversation.contact_id, agent.id)
                          }
                          className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                            isCurrent
                              ? `${agent.bgClass} ${agent.textClass} ${agent.borderClass} font-semibold`
                              : "border-line/60 bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.06]"
                          }`}
                        >
                          <span className="font-bold w-5 text-center">
                            {agent.avatar}
                          </span>
                          <span>{agent.name}</span>
                          {agent.role !== "—" && (
                            <span className="ml-auto text-[10px] text-slate-500">
                              {agent.role}
                            </span>
                          )}
                          {isCurrent && <Check className="size-3 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Etiquetas CRM (Tags del Lead) */}
              <div className="rounded-xl border border-line bg-white/[0.04] p-4">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Tag className="size-3.5 text-signal" />
                    Etiquetas CRM
                  </h3>
                  <span className="text-[10px] text-slate-500">Haz clic para asignar</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {CRM_TAGS.map((tag) => {
                    const currentTags = leadTagsMap[activeConversation.contact_id] || [];
                    const isAssigned = currentTags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => handleToggleTag(activeConversation.contact_id, tag.id)}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                          isAssigned
                            ? `${tag.bgClass} ${tag.textClass} ${tag.borderClass} shadow-sm ring-1 ring-white/10 font-semibold`
                            : "border-line/60 bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
                        }`}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span>{tag.name}</span>
                        {isAssigned && <Check className="size-3 ml-0.5" />}
                      </button>
                    );
                  })}
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

            {/* Tarjeta Fija de Resumen en Drawer Móvil */}
            <div className="border-t border-line/50 pt-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-amber-400" />
                  Resumen del Lead
                </h4>
                <button
                  onClick={() => handleGenerateSummary()}
                  disabled={generatingSummary}
                  className="flex items-center gap-1 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 hover:bg-amber-400/20 transition disabled:opacity-50"
                >
                  <RefreshCw className={`size-2.5 ${generatingSummary ? "animate-spin" : ""}`} />
                  <span>{generatingSummary ? "Analizando..." : "Actualizar"}</span>
                </button>
              </div>

              {currentHandoffSummary ? (
                <div className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs">
                  <p className="text-slate-200 leading-relaxed">
                    {currentHandoffSummary.executiveSummary}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px] pt-1">
                    <div className="rounded bg-ink/60 p-1.5 border border-line">
                      <span className="text-slate-400">Interés: </span>
                      <span className="text-amber-200 font-medium">
                        {currentHandoffSummary.clientInterest}
                      </span>
                    </div>
                    <div className="rounded bg-ink/60 p-1.5 border border-line">
                      <span className="text-slate-400">Urgencia: </span>
                      <span className="text-amber-300 font-bold capitalize">
                        {currentHandoffSummary.urgencyLevel || "Media"}
                      </span>
                    </div>
                  </div>
                  {currentHandoffSummary.recommendedAction && (
                    <p className="text-[11px] text-slate-300 border-t border-amber-400/20 pt-1.5">
                      <strong className="text-amber-300">Sugerencia: </strong>
                      {currentHandoffSummary.recommendedAction}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-ink/40 p-2.5 text-center">
                  <p className="text-[11px] text-slate-400">Sin ficha generada</p>
                  <button
                    onClick={() => handleGenerateSummary()}
                    disabled={generatingSummary}
                    className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-400/20 px-2 py-1 text-[10px] font-semibold text-amber-300"
                  >
                    <Sparkles className="size-3" />
                    <span>Generar Resumen con IA</span>
                  </button>
                </div>
              )}
            </div>

            {/* Etiquetas CRM en Drawer Móvil */}
            <div className="border-t border-line/50 pt-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Tag className="size-3.5 text-signal" />
                Etiquetas CRM
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {CRM_TAGS.map((tag) => {
                  const currentTags = leadTagsMap[activeConversation.contact_id] || [];
                  const isAssigned = currentTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(activeConversation.contact_id, tag.id)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium border transition ${
                        isAssigned
                          ? `${tag.bgClass} ${tag.textClass} ${tag.borderClass} font-semibold`
                          : "border-line/60 bg-white/[0.02] text-slate-400 hover:text-white"
                      }`}
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                      {isAssigned && <Check className="size-3 ml-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

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
    </div>
  );
}
