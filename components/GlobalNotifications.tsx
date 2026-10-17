"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  ShieldAlert,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  playMessageChime,
  playHandoffAlert,
  isSoundEnabled,
  setSoundEnabled,
  initAudio,
} from "@/lib/sound";

export interface InAppNotification {
  id: string;
  type: "message" | "handoff";
  title: string;
  subtitle?: string;
  body: string;
  conversationId: string;
  phone?: string;
  name?: string;
  createdAt: number;
}

export function GlobalNotifications() {
  const router = useRouter();
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [soundOn, setSoundOn] = useState<boolean>(true);
  const [desktopPerm, setDesktopPerm] = useState<NotificationPermission>("default");
  const [showPermPrompt, setShowPermPrompt] = useState<boolean>(false);

  // Registro de eventos recientes para evitar duplicar alertas en milisegundos
  const recentAlertsRef = useRef<Set<string>>(new Set());

  // Inicializar estado de sonido y permisos del navegador
  useEffect(() => {
    setSoundOn(isSoundEnabled());

    if (typeof window !== "undefined" && "Notification" in window) {
      setDesktopPerm(Notification.permission);
      if (Notification.permission === "default") {
        setShowPermPrompt(true);
      }
    }

    // Inicializar AudioContext en cualquier interacción del usuario
    const handleUserInteraction = () => {
      initAudio();
      window.removeEventListener("click", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
    };

    window.addEventListener("click", handleUserInteraction);
    window.addEventListener("keydown", handleUserInteraction);

    return () => {
      window.removeEventListener("click", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
    };
  }, []);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      initAudio().then(() => playMessageChime());
    }
  };

  const requestDesktopPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const res = await Notification.requestPermission();
      setDesktopPerm(res);
      setShowPermPrompt(false);
      if (res === "granted") {
        new Notification("Notificaciones activadas", {
          body: "Recibirás alertas cuando lleguen mensajes o se requiera un asesor.",
          icon: "/favicon.ico",
        });
      }
    } catch (err) {
      console.warn("Error al solicitar permisos de notificación:", err);
    }
  };

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Enviar notificación de escritorio nativa del sistema
  const sendDesktopNotification = useCallback((title: string, body: string, conversationId: string) => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
      try {
        const notif = new Notification(title, {
          body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          tag: conversationId,
        });

        notif.onclick = () => {
          window.focus();
          router.push(`/chat?id=${conversationId}`);
          window.dispatchEvent(
            new CustomEvent("crm:select-chat", { detail: { id: conversationId } })
          );
        };
      } catch (e) {
        console.warn("No se pudo mostrar notificación de escritorio:", e);
      }
    }
  }, [router]);

  // Manejar clic en una notificación in-app
  const handleOpenChat = (conversationId: string, notifId: string) => {
    removeNotification(notifId);
    if (pathname === "/chat") {
      window.dispatchEvent(
        new CustomEvent("crm:select-chat", { detail: { id: conversationId } })
      );
    } else {
      router.push(`/chat?id=${conversationId}`);
    }
  };

  // Suscripción a Realtime de Supabase
  useEffect(() => {
    // 1. Escuchar nuevos mensajes entrantes de clientes
    const channel = supabase
      .channel("global-notification-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMsg = payload.new as {
            id: string;
            conversation_id: string;
            sender: string;
            content: string;
            created_at: string;
          };

          if (newMsg.sender === "client") {
            const dedupeKey = `msg-${newMsg.conversation_id}-${newMsg.id}`;
            if (recentAlertsRef.current.has(dedupeKey)) return;
            recentAlertsRef.current.add(dedupeKey);
            setTimeout(() => recentAlertsRef.current.delete(dedupeKey), 8000);

            // Reproducir sonido de mensaje entrante
            playMessageChime();

            // Obtener información del contacto de la conversación
            let contactName = "Cliente de WhatsApp";
            let contactPhone = "";

            try {
              const { data: convData } = await supabase
                .from("conversations")
                .select("id, contacts(name, phone)")
                .eq("id", newMsg.conversation_id)
                .single();

              const contact = (convData as any)?.contacts;
              if (contact) {
                contactName = contact.name || contact.phone || "Cliente";
                contactPhone = contact.phone || "";
              }
            } catch (err) {
              console.warn("Error al cargar datos del contacto para notificación:", err);
            }

            const notifTitle = `💬 Mensaje de ${contactName}`;
            const notifBody = newMsg.content.length > 90
              ? `${newMsg.content.slice(0, 90)}...`
              : newMsg.content;

            const notifItem: InAppNotification = {
              id: `notif-${Date.now()}-${Math.random()}`,
              type: "message",
              title: notifTitle,
              subtitle: contactPhone,
              body: notifBody,
              conversationId: newMsg.conversation_id,
              name: contactName,
              phone: contactPhone,
              createdAt: Date.now(),
            };

            setNotifications((prev) => [notifItem, ...prev.slice(0, 4)]);

            // Notificación nativa de escritorio
            sendDesktopNotification(notifTitle, notifBody, newMsg.conversation_id);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        async (payload) => {
          const updatedConv = payload.new as {
            id: string;
            status: string;
            last_message_preview?: string;
          };

          // Si la conversación cambió a "waiting_agent" (remitido a un asesor)
          if (updatedConv.status === "waiting_agent") {
            const dedupeKey = `handoff-${updatedConv.id}`;
            if (recentAlertsRef.current.has(dedupeKey)) return;
            recentAlertsRef.current.add(dedupeKey);
            setTimeout(() => recentAlertsRef.current.delete(dedupeKey), 15000);

            // Reproducir sonido especial de alerta de asesor
            playHandoffAlert();

            let contactName = "Cliente en espera";
            let contactPhone = "";

            try {
              const { data: convData } = await supabase
                .from("conversations")
                .select("id, contacts(name, phone)")
                .eq("id", updatedConv.id)
                .single();

              const contact = (convData as any)?.contacts;
              if (contact) {
                contactName = contact.name || contact.phone || "Cliente";
                contactPhone = contact.phone || "";
              }
            } catch (err) {
              console.warn("Error al cargar contacto en alerta de handoff:", err);
            }

            const notifTitle = "🚨 ¡Cliente asignado a Asesor Humano!";
            const notifSubtitle = `${contactName} ${contactPhone ? `(${contactPhone})` : ""}`;
            const notifBody =
              updatedConv.last_message_preview ||
              "El bot remitió esta conversación al equipo de asesores para atención prioritaria.";

            const notifItem: InAppNotification = {
              id: `handoff-${Date.now()}-${Math.random()}`,
              type: "handoff",
              title: notifTitle,
              subtitle: notifSubtitle,
              body: notifBody,
              conversationId: updatedConv.id,
              name: contactName,
              phone: contactPhone,
              createdAt: Date.now(),
            };

            setNotifications((prev) => [notifItem, ...prev.slice(0, 4)]);

            // Notificación de escritorio prioritaria
            sendDesktopNotification(notifTitle, notifSubtitle, updatedConv.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sendDesktopNotification]);

  // Temporizador para auto-descartar notificaciones (6s para mensajes, 12s para handoff)
  useEffect(() => {
    if (notifications.length === 0) return;

    const timer = setInterval(() => {
      const now = Date.now();
      setNotifications((prev) =>
        prev.filter((item) => {
          const maxAge = item.type === "handoff" ? 14000 : 7000;
          return now - item.createdAt < maxAge;
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [notifications]);

  return (
    <>
      {/* Botón flotante para alternar sonido y probar alertas */}
      <div className="fixed bottom-4 right-4 z-40 hidden sm:flex items-center gap-2 rounded-full border border-line bg-panel/90 px-3 py-1.5 shadow-xl backdrop-blur-xl text-xs">
        <button
          onClick={toggleSound}
          title={soundOn ? "Silenciar alertas sonoras" : "Activar sonido de notificaciones"}
          className={`flex items-center gap-1.5 transition ${
            soundOn ? "text-emerald-400 hover:text-emerald-300" : "text-slate-400 hover:text-white"
          }`}
        >
          {soundOn ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
          <span className="font-medium">{soundOn ? "Sonido ON" : "Sonido OFF"}</span>
        </button>

        <span className="text-slate-600">|</span>

        <button
          onClick={() => {
            initAudio().then(() => playHandoffAlert());
          }}
          title="Probar sonido de alerta de asesor"
          className="text-slate-400 hover:text-signal transition flex items-center gap-1"
        >
          <BellRing className="size-3 text-signal" />
          <span>Test</span>
        </button>
      </div>

      {/* Banner de solicitud de permisos de escritorio si están pendientes */}
      {showPermPrompt && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-xl border border-signal/30 bg-panel/95 px-4 py-2.5 shadow-2xl backdrop-blur-xl text-xs text-white">
          <Bell className="size-4 text-signal shrink-0 animate-bounce" />
          <span>¿Deseas recibir alertas de escritorio cuando lleguen mensajes de clientes?</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={requestDesktopPermission}
              className="rounded-lg bg-signal px-2.5 py-1 font-semibold text-ink hover:opacity-90 transition"
            >
              Permitir
            </button>
            <button
              onClick={() => setShowPermPrompt(false)}
              className="rounded-lg border border-line px-2 py-1 text-slate-400 hover:text-white transition"
            >
              Ahora no
            </button>
          </div>
        </div>
      )}

      {/* Contenedor flotante de notificaciones (Toasts / Alertas) */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 pointer-events-none max-w-sm sm:max-w-md w-full">
        {notifications.map((notif) => {
          const isHandoff = notif.type === "handoff";

          return (
            <div
              key={notif.id}
              className={`pointer-events-auto rounded-xl border p-4 shadow-2xl backdrop-blur-xl transition-all duration-300 animate-in fade-in slide-in-from-top-4 ${
                isHandoff
                  ? "border-rose-500/50 bg-rose-950/80 text-white shadow-rose-950/50 ring-1 ring-rose-500/30"
                  : "border-signal/30 bg-panel/95 text-slate-100 shadow-black/60"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
                      isHandoff
                        ? "border-rose-500/40 bg-rose-500/20 text-rose-300 animate-pulse"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {isHandoff ? (
                      <ShieldAlert className="size-5" />
                    ) : (
                      <MessageSquare className="size-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4
                        className={`text-xs font-bold tracking-tight truncate ${
                          isHandoff ? "text-rose-200" : "text-white"
                        }`}
                      >
                        {notif.title}
                      </h4>
                      {isHandoff && (
                        <span className="rounded-full bg-rose-500/20 border border-rose-500/40 px-1.5 py-0.2 text-[10px] font-semibold text-rose-300">
                          Prioritario
                        </span>
                      )}
                    </div>

                    {notif.subtitle && (
                      <p className="text-[11px] text-slate-300 truncate mt-0.5">
                        {notif.subtitle}
                      </p>
                    )}

                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                      {notif.body}
                    </p>

                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => handleOpenChat(notif.conversationId, notif.id)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                          isHandoff
                            ? "bg-rose-500 text-white hover:bg-rose-400 shadow-md shadow-rose-900/40"
                            : "bg-signal text-ink hover:opacity-90"
                        }`}
                      >
                        <span>{isHandoff ? "Atender Ahora" : "Ver Chat"}</span>
                        <ExternalLink className="size-3" />
                      </button>

                      <button
                        onClick={() => removeNotification(notif.id)}
                        className="rounded-lg border border-line px-2 py-1 text-xs text-slate-400 hover:text-white transition"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => removeNotification(notif.id)}
                  className="text-slate-400 hover:text-white transition shrink-0 p-1"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
