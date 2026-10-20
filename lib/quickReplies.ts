export interface QuickReply {
  id: string;
  shortcut: string; // ej: "/precios"
  title: string;    // ej: "Cotización & Tarifas"
  category: "ventas" | "soporte" | "general" | "pagos";
  text: string;
}

export const DEFAULT_QUICK_REPLIES: QuickReply[] = [
  {
    id: "qr-bienvenida",
    shortcut: "/bienvenida",
    title: "Saludo y Presentación del Asesor",
    category: "general",
    text: "¡Hola! Un gusto saludarte, mi nombre es Jesús, asesor comercial de Deploy 🚀. He tomado el control del chat para atenderte personalmente. ¿Cuéntame más sobre tu proyecto o necesidad?",
  },
  {
    id: "qr-precios",
    shortcut: "/precios",
    title: "Explicación de Presupuestos a Medida",
    category: "ventas",
    text: "En Deploy diseñamos cada solución según los requerimientos de tu negocio para que no pagues de más. ¿Te gustaría agendar una breve llamada de 10 minutos para levantar requerimientos y prepararte una propuesta formal sin costo?",
  },
  {
    id: "qr-pagos",
    shortcut: "/pagos",
    title: "Métodos de Pago Aceptados",
    category: "pagos",
    text: "Disponemos de múltiples métodos de pago flexibles:\n• Pago Móvil y transferencias bancarias nacionales (Banesco / Mercantil)\n• Binance Pay (USDT) sin comisión\n• Divisas en efectivo (USD / EUR)\n¿Cuál de estas opciones te resulta más conveniente?",
  },
  {
    id: "qr-servicios",
    shortcut: "/servicios",
    title: "Catálogo Resumido de Servicios",
    category: "ventas",
    text: "Nuestros servicios principales incluyen:\n1️⃣ Desarrollo Web & Landing Pages (Next.js / React de alta conversión)\n2️⃣ Chatbots Inteligentes para WhatsApp con Inteligencia Artificial\n3️⃣ Automatizaciones de procesos (AppSheet, n8n, integraciones de bases de datos)\n4️⃣ Infraestructura Cloud y Soporte Técnico Continuo\n¿En cuál de estas áreas te gustaría enfocar tu proyecto?",
  },
  {
    id: "qr-reunion",
    shortcut: "/reunion",
    title: "Invitación a Videollamada / Requerimientos",
    category: "ventas",
    text: "Para evaluar tu proyecto a fondo y presentarte una demostración en vivo, te propongo coordinar una breve reunión por Google Meet o llamada. ¿Qué horario te queda mejor hoy o mañana?",
  },
  {
    id: "qr-despedida",
    shortcut: "/despedida",
    title: "Cierre Cordial de la Conversación",
    category: "general",
    text: "Ha sido un placer atenderte. Quedo 100% a tu orden para cualquier duda adicional. ¡Que tengas un excelente día! 🚀",
  },
];

const LOCAL_STORAGE_KEY = "crm_quick_replies_custom";

export function getQuickReplies(): QuickReply[] {
  if (typeof window === "undefined") return DEFAULT_QUICK_REPLIES;
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn("No se pudieron cargar respuestas rápidas de localStorage:", err);
  }
  return DEFAULT_QUICK_REPLIES;
}

export function saveQuickReplies(replies: QuickReply[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(replies));
  } catch (err) {
    console.error("Error guardando respuestas rápidas:", err);
  }
}
