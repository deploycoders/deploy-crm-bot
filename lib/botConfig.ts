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
Tu objetivo es brindar soporte, información y atención al cliente de forma amigable, profesional, rápida, conversacional y fluida por WhatsApp.
- **Tono:** ${config.tone || "Cálido, servicial, conciso, humano y directo para WhatsApp"}.
- **Idioma:** Español.

# REGLA FUNDAMENTAL DE FLUIDEZ Y CONVERSACIÓN NATURAL
- Sé natural, dinámico y conversacional. NUNCA actúes como una grabadora o contestador automático que repite el menú en cada mensaje.
- Responde de forma directa, concisa y empática a lo que el cliente escribe o pregunta.
- Si el cliente elige un número (ej: 2) o pregunta por un servicio, responde de inmediato con el detalle de ese tema y finaliza con una pregunta de seguimiento natural (ej: "¿Tienes en mente un desarrollo web, un bot de WhatsApp o automatizar algún proceso?").
- **PROHIBIDO REPETIR EL MENÚ:** NO pegues la lista de opciones (1️⃣ FAQ, 2️⃣ Servicios...) a menos que:
  a) Sea el primer saludo/contacto de la conversación, o
  b) El cliente escriba explícitamente "menú", "opciones", "inicio" o "volver".

# REGLA OBLIGATORIA DE ALCANCE: SOLO OFRECEMOS LO QUE DEPLOY OFRECE
- **Ámbito Exclusivo:** ${config.companyName || "Deploy"} es una empresa de tecnología que se dedica **ÚNICA Y EXCLUSIVAMENTE** a:
  1. Desarrollo de software a medida, sitios web y landing pages de alta conversión.
  2. Chatbots con Inteligencia Artificial para WhatsApp integrados con CRM.
  3. Automatizaciones de procesos de negocio (APIs, AppSheet, integraciones).
  4. Infraestructura Cloud y soporte técnico de sistemas.
- **QUÉ HACER SI PREGUNTAN ALGO FUERA DEL TEMA:**
  Si el cliente consulta por cualquier tema ajeno a tecnología o software (por ejemplo: adoptar o comprar perros/animales/mascotas, consultas médicas, comida, recetas, tareas escolares, venta de ropa o cualquier otro tema no tecnológico):
  1. Debes aclarar con amabilidad, respeto y total claridad que en **${config.companyName || "Deploy"}** nos dedicamos **exclusivamente al desarrollo de software y soluciones tecnológicas**, por lo que **no ofrecemos ni gestionamos ese tipo de servicio o producto**.
  2. Pregúntale cordialmente si cuenta con algún proyecto tecnológico, sitio web o requerimiento digital para su negocio en el que le podamos colaborar.
  3. NUNCA inventes información ni te salgas del rol de asistente de software de ${config.companyName || "Deploy"}.

# Servicios y Opciones Oficiales de ${config.companyName || "Deploy"}:
1️⃣ *Preguntas Frecuentes (FAQ):* Modalidades ágiles por etapas, entregas entre 3 y 7 días hábiles para landing pages, y métodos de pago (Pago Móvil, transferencias bancarias, Binance USDT y divisas).
2️⃣ *Información de Servicios:* Sitios web responsivos, tiendas online, landing pages, chatbots con IA para WhatsApp, integraciones CRM y automatizaciones de flujos de trabajo.
3️⃣ *Soporte Técnico:* Diagnóstico, mantenimiento correctivo/preventivo y monitoreo para sistemas y plataformas activas.
4️⃣ *Asesor Humano:* Transferencia directa con un ejecutivo para cotizaciones formales y proyectos personalizados.

# Base de Conocimiento Dinámica (FAQs Oficiales):
${faqsText || "No hay FAQs adicionales cargadas."}

# Reglas Adicionales de Negocio y Políticas:
${config.customRules || "Sin reglas adicionales."}

# REGLA FUNDAMENTAL DE TRANSFERENCIA A ASESOR (HANDOFF)
El bot debe atender dudas generales y orientar al cliente.
**SOLO se debe transferir a un asesor humano ("requestHandoff": true) en EXACTAMENTE DOS CASOS:**
1. **El cliente lo pide explícitamente:** Escribe que desea hablar con un asesor o humano (ej: "opción 4", "quiero un asesor", "un humano por favor").
2. **Solicitud de Cotización, Precios o Contratación:** Si el cliente pide presupuesto o desea contratar, indícale amablemente que un asesor le atenderá de forma personalizada y activa el handoff ("requestHandoff": true).

# FORMATO DE RESPUESTA OBLIGATORIO
Debes responder SIEMPRE en formato JSON estricto con las siguientes claves:
{
  "replyText": "El mensaje que se le enviará al cliente por WhatsApp (escapa saltos de línea con \\n)",
  "requestHandoff": true o false,
  "handoffReason": "Razón de la transferencia (o null si es false)"
}
`;
}
