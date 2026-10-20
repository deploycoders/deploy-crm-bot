/**
 * lib/notifications.ts
 * Utilidades para notificaciones push del navegador (Browser Notifications API).
 * Maneja permisos, preferencias y disparo de notificaciones.
 */

const NOTIF_PREF_KEY = "crm_push_notifications_enabled";

/** Comprueba si el navegador soporta notificaciones push */
export function supportsNotifications(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Estado actual del permiso del navegador */
export function getNotificationPermission(): NotificationPermission | "unavailable" {
  if (!supportsNotifications()) return "unavailable";
  return Notification.permission;
}

/** Preferencia del usuario (guardada en localStorage) */
export function isPushEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem(NOTIF_PREF_KEY);
  return stored === null ? false : stored === "true";
}

export function setPushEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(NOTIF_PREF_KEY, String(enabled));
}

/**
 * Solicita permiso al usuario para enviar notificaciones.
 * Devuelve true si el permiso fue concedido.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!supportsNotifications()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch {
    return false;
  }
}

/**
 * Dispara una notificación push nativa del navegador.
 * Solo funciona si el permiso está concedido Y el usuario lo habilitó en el CRM.
 */
export function sendBrowserNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    onClick?: () => void;
  }
): Notification | null {
  if (!supportsNotifications()) return null;
  if (!isPushEnabled()) return null;
  if (Notification.permission !== "granted") return null;

  try {
    const notif = new Notification(title, {
      body: options?.body,
      icon: options?.icon ?? "/favicon.ico",
      tag: options?.tag ?? "crm-notification",
      silent: false,
    });

    if (options?.onClick) {
      notif.onclick = () => {
        window.focus();
        options.onClick!();
        notif.close();
      };
    }

    // Auto-cerrar después de 7 segundos
    setTimeout(() => notif.close(), 7000);

    return notif;
  } catch (err) {
    console.warn("No se pudo enviar la notificación push:", err);
    return null;
  }
}

/**
 * Notificación específica para mensaje entrante de un cliente.
 */
export function notifyIncomingMessage(
  contactName: string,
  messagePreview: string,
  conversationId: string
): void {
  sendBrowserNotification(`💬 Nuevo mensaje de ${contactName}`, {
    body: messagePreview,
    tag: `msg-${conversationId}`,
    onClick: () => {
      window.dispatchEvent(
        new CustomEvent("crm:select-chat", { detail: { id: conversationId } })
      );
    },
  });
}

/**
 * Notificación específica para handoff (lead esperando asesor humano).
 */
export function notifyHandoff(
  contactName: string,
  conversationId: string
): void {
  sendBrowserNotification(`🚨 ¡Lead esperando asesor! – ${contactName}`, {
    body: "El bot ha derivado esta conversación. Requiere atención inmediata.",
    tag: `handoff-${conversationId}`,
    onClick: () => {
      window.dispatchEvent(
        new CustomEvent("crm:select-chat", { detail: { id: conversationId } })
      );
    },
  });
}
