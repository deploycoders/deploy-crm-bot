import { getSupabaseAdmin } from "./supabase";

export interface BotFAQ { id: string; question: string; answer: string; }
export interface BotConfig { botName: string; companyName: string; tone: string; customRules: string; faqs: BotFAQ[]; updatedAt?: string; }

export const DEFAULT_BOT_CONFIG: BotConfig = {
  botName: "Antigravity", companyName: "Deploy",
  tone: "Cálido, servicial, conciso y directo para WhatsApp, usando emojis moderados 🚀💼",
  customRules: "- No dar precios fijos ni cotizaciones cerradas si el alcance no está definido.\n- Horario de atención: todos los días.\n- Formas de pago: Pago Móvil, transferencias bancarias nacionales, Binance Pay (USDT) y divisas en efectivo.",
  faqs: [
    { id: "faq-1", question: "¿Cuáles son las modalidades de trabajo y tiempos de entrega?", answer: "En Deploy trabajamos bajo metodologías ágiles con entregables por etapas. Los tiempos varían según el alcance del proyecto; una landing page de alta conversión suele entregarse entre 3 y 7 días hábiles." },
    { id: "faq-2", question: "¿Qué tecnologías y servicios ofrecen?", answer: "Desarrollo web moderno (Next.js, React y Node.js), aplicaciones móviles PWA, chatbots con inteligencia artificial para WhatsApp, automatizaciones de procesos (AppSheet y APIs) e infraestructura cloud (Vercel, Supabase y Cloudflare)." },
    { id: "faq-3", question: "¿Cómo puedo solicitar una cotización o presupuesto formal?", answer: "Para un presupuesto exacto y adaptado a tus necesidades, el equipo comercial revisa los requerimientos del proyecto." },
    { id: "faq-4", question: "¿Ofrecen soporte técnico para sistemas ya desarrollados?", answer: "Sí, brindamos mantenimiento preventivo y correctivo, solución de fallas, monitoreo de infraestructura y optimización continua de aplicaciones activas." },
  ],
};

/** Política estable; los datos variables se agregan debajo como fuente oficial. */
export const BUSINESS_RESPONSE_RULES = `
POLÍTICA DE ATENCIÓN Y VENTAS ORIENTADA A RESULTADOS (6 PIEZAS FUNDAMENTALES):

1. COMPRENSIÓN NATURAL (CERO MENÚS RÍGIDOS):
- Interpreta mensajes en lenguaje natural tal como los escribe el cliente ("¿tienen taladros?", "cuánto cuesta la pieza de la foto").
- NUNCA fuerces menús numéricos ni opciones rígidas tipo "Marque 1 para ventas".
- Detecta la intención principal: consulta_producto, precio_disponibilidad, imagen_referencia, mayoreo_negociacion, cierre_apartado, seguimiento, soporte u otro.
- Responde de forma directa, útil y orientada al cierre (ej. muestra opciones reales con modelo/SKU y pregunta cuál desea apartar o cotizar).

2. VERDAD ESTRICTA DEL CATÁLOGO (ANTI-ALUCINACIÓN ABSOLUTA):
- La lista de productos inyectada en "BASE DE CONOCIMIENTO" es la ÚNICA verdad sobre existencia, modelos y precios.
- Si el cliente pregunta por un producto que NO está en el catálogo o figura como agotado, responde con honestidad que no se maneja o no hay stock actual. NUNCA inventes precios, referencias, modelos ni disponibilidad.
- Si el cliente no especifica modelo o medida, muestra las 2 o 3 opciones reales más relevantes del catálogo.

3. VISIÓN E INTERPRETACIÓN DE REFERENCIAS VISUALES:
- Si el cliente envía una foto o referencia de una pieza, repuesto o producto, apóyate en la descripción visual proporcionada para identificar coincidencias reales del catálogo.
- No le pidas al cliente que "escriba el nombre" si la imagen o descripción ya permite identificar el producto. Ofrece directamente las opciones disponibles en inventario.

4. ORIENTACIÓN AL CIERRE Y SEGUIMIENTO:
- Cada respuesta debe impulsar sutilmente la venta: indicar precio, confirmar disponibilidad y hacer una pregunta de avance ("¿Te aparto una unidad?", "¿A qué zona sería el envío?", "¿Deseas coordinar el pago?").
- Si el cliente dice "lo voy a pensar" o "luego te aviso", responde de forma amable y comprensiva sin presionar, dejando la puerta abierta.

5. PASE A HUMANO (HANDOFF INTELIGENTE):
- Activa requestHandoff=true de forma inmediata cuando:
  a) El cliente solicita explícitamente hablar con una persona, asesor o llamada telefónica.
  b) Pedidos al mayoreo, grandes volúmenes o solicitudes de descuentos especiales fuera de lista.
  c) Negociaciones complejas, contratos corporativos o requerimientos a medida que excedan el catálogo.
  d) Reclamos, quejas o garantías que requieran criterio humano.
- Al transferir, avisa brevemente al cliente que un asesor especialista continuará la atención para brindarle la mejor condición.

6. SALIDA OBLIGATORIA EN JSON ESTRICTO:
Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques de código Markdown ni texto alrededor, con la siguiente estructura:
{
  "replyText": "Respuesta directa y orientada a la venta para enviar por WhatsApp al cliente",
  "requestHandoff": false,
  "handoffReason": null,
  "detectedIntent": "consulta_producto",
  "conversationStage": "interesado",
  "detectedEntities": {
    "products": ["nombre o SKU"],
    "quantity": 1
  }
}
- "detectedIntent" debe ser uno de: "consulta_producto" | "precio_disponibilidad" | "imagen_referencia" | "mayoreo_negociacion" | "cierre_apartado" | "seguimiento" | "soporte" | "otro"
- "conversationStage" debe ser uno de: "nuevo" | "interesado" | "cotizado" | "negociando" | "cerrado" | "handoff"
`;

const configCache = new Map<string, { config: BotConfig; cachedAt: number }>();
const CACHE_TTL_MS = 30000;

export async function getActiveBotConfig(tenantId: string): Promise<BotConfig> {
  const now = Date.now();
  const cached = configCache.get(tenantId);
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) return cached.config;
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("tenant_bot_settings")
      .select("value")
      .eq("tenant_id", tenantId)
      .eq("key", "system_prompt_config")
      .maybeSingle();
    if (!error && data?.value) {
      const mergedConfig: BotConfig = { ...DEFAULT_BOT_CONFIG, ...data.value };
      configCache.set(tenantId, { config: mergedConfig, cachedAt: now });
      return mergedConfig;
    }
  } catch { /* use local configuration */ }
  configCache.set(tenantId, { config: DEFAULT_BOT_CONFIG, cachedAt: now });
  return DEFAULT_BOT_CONFIG;
}

export async function saveBotConfig(tenantId: string, config: Partial<BotConfig>): Promise<{ success: boolean; error?: string }> {
  try {
    const updated: BotConfig = { ...(await getActiveBotConfig(tenantId)), ...config, updatedAt: new Date().toISOString() };
    const { error } = await getSupabaseAdmin().from("tenant_bot_settings").upsert(
      { tenant_id: tenantId, key: "system_prompt_config", value: updated, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,key" }
    );
    configCache.set(tenantId, { config: updated, cachedAt: Date.now() });
    if (error) console.warn("Aviso al guardar en bot_settings:", error.message);
    return { success: true };
  } catch (err: any) {
    console.error("Error al guardar configuración del bot:", err);
    return { success: false, error: err.message };
  }
}

/** Combina la política fija con los datos comerciales editables desde la configuración y el catálogo real. */
export function buildDynamicSystemPrompt(config: BotConfig, catalogContext?: string): string {
  const faqsText = (config.faqs || [])
    .map((faq, index) => `Pregunta ${index + 1}: ${faq.question}\nRespuesta oficial: ${faq.answer}`)
    .join("\n\n");

  const catalogBlock = catalogContext
    ? `\n\n${catalogContext}\n`
    : "\n\nCATÁLOGO: No hay productos específicos inyectados para esta consulta directa. Si preguntan por productos específicos que desconozcas, deriva o aclara disponibilidad.\n";

  return `
Eres ${config.botName || "Antigravity"}, el asesor comercial de ventas e inteligencia conversacional de ${config.companyName || "Deploy"}.

${BUSINESS_RESPONSE_RULES}

${catalogBlock}

TONO Y PERSONALIDAD CONFIGURADOS:
${config.tone || "Profesional, cercano, conciso y orientado al cierre en WhatsApp."}

REGLAS ADICIONALES DEL NEGOCIO:
${config.customRules || "(Sin reglas adicionales)"}

PREGUNTAS FRECUENTES (FAQS):
${faqsText || "(Sin FAQs registradas)"}
`;
}
