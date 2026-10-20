import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "";

const ai = new GoogleGenAI({ apiKey });

interface ConversationMessage {
  sender: "client" | "bot" | "agent" | "system";
  content: string;
}

export interface AIResponse {
  replyText: string;
  requestHandoff: boolean;
  handoffReason?: string;
}

const SYSTEM_PROMPT = `
# Rol y Personalidad
Eres **Antigravity**, el asistente virtual oficial de **Deploy**, empresa de desarrollo de software y soluciones tecnológicas.
Tu objetivo es brindar soporte, información y atención al cliente de forma amigable, profesional, rápida y concisa por WhatsApp.
- **Tono:** Cálido, servicial, conciso y directo (ideal para lectura rápida en WhatsApp móvil, usando viñetas claras y emojis con moderación 🚀💼).
- **Idioma:** Español.

# Menú de Opciones y Servicios (Selección por Número)
Cuando el usuario escriba un número (1, 2, 3 o 4) o una consulta directa relacionada, responde EXCLUSIVAMENTE basándote en estas opciones:
1️⃣ *Preguntas Frecuentes (FAQ):* Modalidades de trabajo, procesos y políticas generales de atención. (Nota: Las tarifas y cotizaciones no se dan de forma general; las gestiona un asesor para brindar una atención personalizada).
2️⃣ *Información de Productos y Servicios:* Sitios web, landing pages, sistemas a medida, chatbots, bots, automatizaciones de procesos (AppSheet/scripts) e infraestructura Cloud que ofrece Deploy.
3️⃣ *Soporte y Solución de Problemas (Troubleshooting):* Diagnóstico inicial y asistencia exclusiva para resolver incidencias técnicas en sistemas o servicios activos de Deploy.
4️⃣ *Hablar con un Asesor Humano:* Conexión directa con nuestro equipo de especialistas para cotizaciones detalladas y atención personalizada.

# REGLA OBLIGATORIA: ESTRICTO ALCANCE DE DEPLOY (CERO FUERA DE CONTEXTO)
- **Ámbito Exclusivo:** Responde ÚNICAMENTE sobre los servicios, productos y soporte de Deploy.
- **Prohibido Código y Tutoriales:** NO escribas código de programación, NO des tutoriales de "cómo hacer" cosas técnicas, NO resuelvas tareas escolares, NO respondas preguntas de cultura general, trivia ni datos curiosos (estilo Wikipedia). Si intentan sacarte de contexto o pedirte ayuda de programación genérica, responde cortésmente que tu función se limita exclusivamente a los servicios y soluciones de la agencia Deploy y reorienta al menú.

# Contexto del Negocio y Servicios
- **Nombre:** Deploy.
- **Ubicación:** No menciones la ubicación exacta de la empresa en el chat; aclara siempre que esa información o detalles de presencialidad los coordina directamente el asesor en caso de ser necesario.
- **Horarios:** Atención todos los días.
- **Servicios:**
  1. *Desarrollo Web y Landing Pages:* Next.js, React, Node.js, landing pages de alta conversión, plataformas a medida y PWA.
  2. *Chatbots, Bots y Automatizaciones:* Creación de chatbots inteligentes, bots interactivos, automatización de procesos de negocio, AppSheet, integraciones vía APIs y bases de datos.
  3. *Infraestructura y Cloud:* Despliegues en Vercel, Supabase, Railway, Cloudflare y GitHub.
  4. *Soporte Técnico y Mantenimiento:* Soporte de software y hardware preventivo/correctivo para sistemas de la agencia.
- **Formas de Pago:** Pago Móvil, transferencias bancarias nacionales, Binance Pay / USDT y divisas en efectivo.

# Política de Precios y Cotizaciones
- **Atención Personalizada:** El bot NUNCA debe dar precios fijos, tarifas cerradas ni cotizaciones automáticas. Cada proyecto requiere un análisis a la medida. Siempre debes indicar que los presupuestos y cotizaciones los entrega directamente un asesor humano para garantizar una atención personalizada, guiando al usuario a la opción 4 (Asesor) o activando la transferencia.

# Troubleshooting (Soporte Técnico)
Si el usuario reporta una falla o problema técnico con un sistema o servicio activo de Deploy:
- Pide detalles breves del error.
- Brinda diagnóstico y pasos recomendados para solucionarlo.
- NO transfieras a un asesor por soporte técnico a menos que el cliente lo pida expresamente.

# REGLA FUNDAMENTAL DE ATENCIÓN Y TRANSFERENCIA A ASESOR (HANDOFF)
El bot DEBE ATENDER Y RESOLVER SIEMPRE las dudas generales sobre qué hace Deploy dentro de su alcance.
**SOLO se debe transferir a un asesor humano ("requestHandoff": true) en EXACTAMENTE DOS CASOS:**
1. **El cliente lo elige o pide explícitamente en el chat:** El usuario selecciona la opción 4, o escribe claramente que quiere hablar con un asesor o persona humana (ej: "quiero hablar con un asesor", "pásame con un humano", "asesor", "opción 4").
2. **Solicitud de Cotización, Precios o Contratación:** Como los precios, presupuestos y cotizaciones los maneja exclusivamente el asesor para una atención personalizada, si el cliente pide precios, costos o desea contratar un servicio, indícale amablemente que un asesor le atenderá de forma personalizada y activa el handoff ("requestHandoff": true).

# FORMATO DE RESPUESTA OBLIGATORIO
Debes responder SIEMPRE en formato JSON estricto con las siguientes claves:
{
  "replyText": "El mensaje que se le enviará al cliente por WhatsApp",
  "requestHandoff": true o false,
  "handoffReason": "Razón de la transferencia (o null si es false)"
}
`;

// Modelos en orden de velocidad, disponibilidad y estabilidad (Sin tocar)
const GEMINI_MODELS = [
  "gemini-3.1-flash-lite", // Máxima velocidad (<1s) y alta disponibilidad
  "gemini-3.8-flash",      // Modelo avanzado recomendado
  "gemini-3.7-flash",      // Modelo con razonamiento rápido
  "gemini-3.5-flash",      // Fallback
];

async function callWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout tras ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function callGeminiWithFallback(prompt: string): Promise<string> {
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`🤖 Intentando modelo: ${model}`);
      const response = await callWithTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0.3,
          },
        }),
        8000
      );
      console.log(`✅ Éxito con modelo: ${model}`);
      return response.text || "{}";
    } catch (err: any) {
      const status = err?.status ?? err?.error?.code;
      console.warn(`⚠️ Modelo ${model} no respondió a tiempo o no disponible (${status || err.message}), probando siguiente...`);
      lastError = err;
      continue;
    }
  }

  throw lastError;
}

export async function generateAIResponse(
  history: ConversationMessage[],
  newMessage: string
): Promise<AIResponse> {
  if (!apiKey) {
    console.error("GEMINI_API_KEY no está configurada");
    return {
      replyText: "Hola, gracias por comunicarte con Deploy. En este momento estamos configurando el asistente virtual.",
      requestHandoff: false,
    };
  }

  try {
    const formattedHistory = history
      .filter((m) => m.sender !== "system")
      .map((m) => `${m.sender === "client" ? "Cliente" : "Asistente"}: ${m.content}`)
      .join("\n");

    const prompt = `
Historial de la conversación reciente:
${formattedHistory}

Mensaje(s) reciente(s) recibido(s) del cliente (pueden ser varios acumulados):
"${newMessage}"

INSTRUCCIONES CLAVE PARA ESTA RESPUESTA:
1. Responde a TODAS las preguntas o temas mencionados por el cliente en UN SOLO MENSAJE completo y bien estructurado.
2. MANTÉN EL MENÚ EN LA CONVERSACIÓN: incluye o recapitula al final las opciones del menú principal (1️⃣ FAQ, 2️⃣ Servicios, 3️⃣ Soporte, 4️⃣ Asesor) o un pie claro para que el cliente continúe interactuando.
3. Genera la respuesta en el formato JSON indicado.`;

    const text = await callGeminiWithFallback(prompt);

    return extractCleanReply(text);
  } catch (error) {
    console.error("Error al generar respuesta con Gemini (todos los modelos fallaron):", error);
    return {
      replyText: "¡Hola! 👋 Bienvenido a Deploy. ¿En qué servicio o consulta tecnológica te podemos ayudar hoy?\n\n📌 *Menú de Opciones:*\n1️⃣ *FAQ:* Preguntas frecuentes y formas de pago\n2️⃣ *Servicios:* Desarrollo web, chatbots y automatizaciones\n3️⃣ *Soporte:* Incidencias y diagnóstico técnico\n4️⃣ *Asesor:* Conectar con un especialista\n\n*(Escribe el número de la opción o 'Menú')* 🚀",
      requestHandoff: false,
      handoffReason: undefined,
    };
  }
}

/**
 * Limpia y extrae la respuesta del bot sin filtrar estructuras JSON técnicas
 */
export function cleanJsonArtifacts(text: string): string {
  if (!text) return "";
  let s = text.trim();

  // Si tiene bloque de código markdown tipo ```json
  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();

  // Si contiene el patrón de JSON crudo {"replyText": ...}
  if (s.includes('"replyText"')) {
    // Intentar regex para capturar el valor de replyText multilínea
    const regex = /"replyText"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"requestHandoff"|\s*,\s*"handoffReason"|\s*})/i;
    const match = s.match(regex);
    if (match && match[1]) {
      s = match[1];
    } else {
      // Remover prefijo y sufijo JSON
      s = s
        .replace(/^\{\s*"replyText"\s*:\s*"/i, "")
        .replace(/"\s*,\s*"requestHandoff"[\s\S]*$/i, "")
        .replace(/"\s*\}$/, "");
    }
  }

  // Normalizar secuencias de escape
  s = s
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .trim();

  return s;
}

/**
 * Extrae limpiamente replyText, requestHandoff y handoffReason
 * sin importar si el modelo usó JSON puro, JSON con saltos de línea crudos, o texto simple.
 */
export function extractCleanReply(rawText: string): AIResponse {
  const fallbackText =
    "¡Hola! Bienvenido a Deploy 🚀\n\n¿En qué te podemos colaborar hoy?\n\n📌 *Menú Principal:*\n1️⃣ Preguntas Frecuentes (FAQ)\n2️⃣ Servicios y Soluciones Web\n3️⃣ Soporte Técnico\n4️⃣ Hablar con un Asesor";

  if (!rawText || !rawText.trim()) {
    return { replyText: fallbackText, requestHandoff: false };
  }

  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

  // 1. Intento con JSON.parse estándar
  try {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = cleaned.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        const reply = typeof parsed.replyText === "string" ? parsed.replyText : "";
        return {
          replyText: cleanJsonArtifacts(reply) || fallbackText,
          requestHandoff: Boolean(parsed.requestHandoff),
          handoffReason: parsed.handoffReason || undefined,
        };
      }
    }
  } catch {
    // Si falla por caracteres de control (newlines crudos en strings), usar regex tolerante
  }

  // 2. Extracción mediante regex multilínea tolerante a newlines crudos
  try {
    const replyRegex = /"replyText"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"requestHandoff"|\s*,\s*"handoffReason"|\s*})/i;
    const match = cleaned.match(replyRegex);

    let extractedReply = "";
    if (match && match[1]) {
      extractedReply = match[1];
    }

    const handoffMatch = cleaned.match(/"requestHandoff"\s*:\s*(true|false)/i);
    const requestHandoff = handoffMatch ? handoffMatch[1].toLowerCase() === "true" : false;

    const reasonMatch = cleaned.match(/"handoffReason"\s*:\s*(?:"([^"]*)"|null)/i);
    const handoffReason = reasonMatch && reasonMatch[1] ? reasonMatch[1] : undefined;

    if (extractedReply) {
      return {
        replyText: cleanJsonArtifacts(extractedReply) || fallbackText,
        requestHandoff,
        handoffReason,
      };
    }
  } catch {
    // Continuar al paso 3
  }

  // 3. Fallback: Limpieza profunda de cualquier resto de JSON
  return {
    replyText: cleanJsonArtifacts(cleaned) || fallbackText,
    requestHandoff: /"requestHandoff"\s*:\s*true/i.test(cleaned),
    handoffReason: undefined,
  };
}