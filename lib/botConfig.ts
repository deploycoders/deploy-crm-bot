import { getSupabaseAdmin } from "./supabase";

export interface BotFAQ {
  id: string;
  question: string;
  answer: string;
}

export interface BotConfig {
  botName: string;
  companyName: string;
  tone: string;
  customRules: string;
  faqs: BotFAQ[];
  updatedAt?: string;
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
  botName: "Antigravity",
  companyName: "Deploy",
  tone: "Cálido, servicial, conciso y directo para WhatsApp móvil, usando emojis moderados 🚀💼",
  customRules:
    "- Prohibido código de programación o tutoriales genéricos.\n" +
    "- No dar precios fijos ni cotizaciones cerradas; guiar a la opción 4 de asesor humano.\n" +
    "- Horario de atención: todos los días.\n" +
    "- Formas de pago: Pago Móvil, transferencias bancarias nacionales, Binance Pay (USDT) y divisas en efectivo.",
  faqs: [
    {
      id: "faq-1",
      question: "¿Cuáles son las modalidades de trabajo y tiempos de entrega?",
      answer: "En Deploy trabajamos bajo metodologías ágiles con entregables por etapas. Los tiempos varían según el alcance del proyecto (por ejemplo, una Landing Page de alta conversión suele entregarse entre 3 y 7 días hábiles).",
    },
    {
      id: "faq-2",
      question: "¿Qué tecnologías y servicios ofrecen?",
      answer: "Desarrollo web moderno (Next.js, React, Node.js), aplicaciones móviles PWA, chatbots con Inteligencia Artificial para WhatsApp, automatizaciones de procesos (AppSheet, APIs) e infraestructura Cloud (Vercel, Supabase, Cloudflare).",
    },
    {
      id: "faq-3",
      question: "¿Cómo puedo solicitar una cotización o presupuesto formal?",
      answer: "Para darte un presupuesto exacto y adaptado a tus necesidades, un asesor comercial humano se comunicará contigo de inmediato para revisar los requerimientos de tu proyecto.",
    },
    {
      id: "faq-4",
      question: "¿Ofrecen soporte técnico para sistemas ya desarrollados?",
      answer: "Sí, brindamos mantenimiento preventivo y correctivo, solución de fallas, monitoreo de infraestructura y optimización continua de aplicaciones activas.",
    },
  ],
};

// Caché en memoria para optimizar llamadas serverless (TTL 30 segundos)
let cachedConfig: BotConfig | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 30000;

/**
 * Obtiene la configuración activa del bot, consultando Supabase o usando fallback en memoria
 */
export async function getActiveBotConfig(): Promise<BotConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("bot_settings")
      .select("value")
      .eq("key", "system_prompt_config")
      .maybeSingle();

    if (!error && data?.value) {
      const mergedConfig: BotConfig = {
        ...DEFAULT_BOT_CONFIG,
        ...data.value,
      };
      cachedConfig = mergedConfig;
      lastCacheTime = now;
      return mergedConfig;
    }
  } catch {
    // Si la tabla aún no existe o hay error de red, usamos default
  }

  cachedConfig = DEFAULT_BOT_CONFIG;
  lastCacheTime = now;
  return DEFAULT_BOT_CONFIG;
}

/**
 * Guarda o actualiza la configuración del bot en Supabase
 */
export async function saveBotConfig(config: Partial<BotConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const current = await getActiveBotConfig();
    const updated: BotConfig = {
      ...current,
      ...config,
      updatedAt: new Date().toISOString(),
    };

    const supabase = getSupabaseAdmin();

    // Intentar upsert en bot_settings
    const { error } = await supabase.from("bot_settings").upsert(
      {
        key: "system_prompt_config",
        value: updated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

    if (error) {
      console.warn("Aviso al guardar en bot_settings (posible tabla no creada aún):", error.message);
      // Mantener en memoria
      cachedConfig = updated;
      lastCacheTime = Date.now();
      return { success: true };
    }

    cachedConfig = updated;
    lastCacheTime = Date.now();
    return { success: true };
  } catch (err: any) {
    console.error("Error al guardar configuración del bot:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Construye el SYSTEM_PROMPT dinámico integrando la configuración y la base de conocimiento
 */
export function buildDynamicSystemPrompt(config: BotConfig): string {
  const faqsText = (config.faqs || [])
    .map((f, i) => `   Pregunta ${i + 1}: ${f.question}\n   Respuesta Oficial: ${f.answer}`)
    .join("\n\n");

  return `
# Rol y Personalidad
Eres **${config.botName || "Antigravity"}**, el asistente virtual oficial de **${config.companyName || "Deploy"}**, empresa de desarrollo de software y soluciones tecnológicas.
Tu objetivo es brindar soporte, información y atención al cliente de forma amigable, profesional, rápida y concisa por WhatsApp.
- **Tono:** ${config.tone || "Cálido, servicial, conciso y directo para WhatsApp"}.
- **Idioma:** Español.

# Menú de Opciones y Servicios (Selección por Número)
Cuando el usuario escriba un número (1, 2, 3 o 4) o una consulta directa relacionada, responde EXCLUSIVAMENTE basándote en estas opciones:
1️⃣ *Preguntas Frecuentes (FAQ):* Modalidades de trabajo, procesos y políticas generales de atención. (Nota: Las tarifas y cotizaciones no se dan de forma general; las gestiona un asesor para brindar una atención personalizada).
2️⃣ *Información de Productos y Servicios:* Sitios web, landing pages, sistemas a medida, chatbots, bots, automatizaciones de procesos (AppSheet/scripts) e infraestructura Cloud que ofrece ${config.companyName || "Deploy"}.
3️⃣ *Soporte y Solución de Problemas (Troubleshooting):* Diagnóstico inicial y asistencia exclusiva para resolver incidencias técnicas en sistemas o servicios activos de ${config.companyName || "Deploy"}.
4️⃣ *Hablar con un Asesor Humano:* Conexión directa con nuestro equipo de especialistas para cotizaciones detalladas y atención personalizada.

# REGLA OBLIGATORIA: ESTRICTO ALCANCE DE ${config.companyName || "DEPLOY"}
- **Ámbito Exclusivo:** Responde ÚNICAMENTE sobre los servicios, productos y soporte de ${config.companyName || "Deploy"}.
- **Prohibido Código y Tutoriales:** NO escribas código de programación, NO des tutoriales técnicos genéricos, NO resuelvas tareas escolares ni trivia. Si intentan sacarte de contexto, responde cortésmente que tu función se limita a los servicios y soluciones de ${config.companyName || "Deploy"} y reorienta al menú.

# Base de Conocimiento Dinámica (FAQs Oficiales):
${faqsText || "No hay FAQs adicionales cargadas."}

# Reglas Adicionales de Negocio y Políticas:
${config.customRules || "Sin reglas adicionales."}

# REGLA FUNDAMENTAL DE ATENCIÓN Y TRANSFERENCIA A ASESOR (HANDOFF)
El bot DEBE ATENDER Y RESOLVER dudas generales sobre qué hace la empresa dentro de su alcance.
**SOLO se debe transferir a un asesor humano ("requestHandoff": true) en EXACTAMENTE DOS CASOS:**
1. **El cliente lo elige o pide explícitamente en el chat:** El usuario selecciona la opción 4, o escribe claramente que desea hablar con un asesor o persona humana (ej: "quiero hablar con un asesor", "pásame con un humano", "asesor", "opción 4").
2. **Solicitud de Cotización, Precios o Contratación:** Si el cliente pide precios, costos o desea contratar un servicio, indícale amablemente que un asesor le atenderá de forma personalizada y activa el handoff ("requestHandoff": true).

# FORMATO DE RESPUESTA OBLIGATORIO
Debes responder SIEMPRE en formato JSON estricto con las siguientes claves:
{
  "replyText": "El mensaje que se le enviará al cliente por WhatsApp (escapa saltos de línea con \\n)",
  "requestHandoff": true o false,
  "handoffReason": "Razón de la transferencia (o null si es false)"
}
`;
}
