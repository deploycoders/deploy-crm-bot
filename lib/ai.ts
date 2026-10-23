import { GoogleGenAI } from "@google/genai";
import { getActiveBotConfig, buildDynamicSystemPrompt } from "./botConfig";

export function isGeminiKeyConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && !key.includes("placeholder") && key.trim().length > 10);
}

export function getGenAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!isGeminiKeyConfigured() || !key) return null;
  return new GoogleGenAI({ apiKey: key.trim() });
}

export interface ConversationMessage {
  sender: "client" | "bot" | "agent" | "system";
  content: string;
}

export interface AIResponse {
  replyText: string;
  requestHandoff: boolean;
  handoffReason?: string;
}

export interface HandoffSummary {
  executiveSummary: string;
  clientInterest: string;
  urgencyLevel: "alta" | "media" | "baja";
  recommendedAction: string;
}

// Modelos en orden de velocidad, disponibilidad y estabilidad
// IMPORTANTE: Solo IDs de modelos válidos en Google AI Studio / Gemini API
const GEMINI_MODELS = [
  "gemini-2.0-flash",               // Más rápido y disponible (recomendado)
  "gemini-2.5-flash-preview-04-17", // Más capaz, preview
  "gemini-1.5-flash",               // Fallback estable
  "gemini-1.5-pro",                 // Último recurso si flash no está disponible
];

async function callWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout tras ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

async function callGeminiWithFallback(prompt: string, systemInstruction?: string): Promise<string> {
  const ai = getGenAIClient();
  if (!ai) {
    throw new Error("GEMINI_API_KEY no configurada o es placeholder");
  }

  let lastError: unknown;
  const config = await getActiveBotConfig();
  const instruction = systemInstruction || buildDynamicSystemPrompt(config);

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`🤖 Intentando modelo: ${model}`);
      const response = await callWithTimeout(
        ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction: instruction,
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

/**
 * Normaliza el mimeType que llega de WhatsApp a uno que Gemini acepta.
 *
 * WhatsApp envía audios como:
 *   - "audio/ogg; codecs=opus"  → lo convierte a "audio/ogg"
 *   - "audio/opus"              → no soportado directamente, usar "audio/ogg"
 *   - "audio/mp4"               → "audio/mp4" (aceptado)
 *   - "audio/mpeg"              → "audio/mp3" (aceptado)
 *
 * Gemini acepta: audio/wav, audio/mp3, audio/aiff, audio/aac, audio/ogg, audio/flac
 */
function normalizeAudioMimeType(rawMime: string): string {
  // Quitar parámetros como "; codecs=opus"
  const base = rawMime.split(";")[0].trim().toLowerCase();

  const mimeMap: Record<string, string> = {
    "audio/opus":  "audio/ogg",   // Opus viene en contenedor OGG
    "audio/mpeg":  "audio/mp3",
    "audio/mp4":   "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a":   "audio/mp4",
    "audio/ogg":   "audio/ogg",
    "audio/wav":   "audio/wav",
    "audio/wave":  "audio/wav",
    "audio/flac":  "audio/flac",
    "audio/aac":   "audio/aac",
    "audio/aiff":  "audio/aiff",
    "audio/x-aiff":"audio/aiff",
  };

  return mimeMap[base] ?? "audio/ogg"; // default a ogg para WhatsApp
}

/**
 * Transcribe un audio o nota de voz de WhatsApp usando Google Gemini.
 *
 * Estrategia (en orden de preferencia):
 *  1. Gemini Files API  → sube el archivo y lo referencia con fileData {}
 *     (más robusto, soporta archivos grandes, estado PROCESSING manejado)
 *  2. inlineData base64 → como fallback para archivos pequeños (<5MB)
 *     (solo si la Files API falla)
 *
 * Modelos correctos para audio multimodal:
 *  - gemini-2.5-flash-preview-04-17
 *  - gemini-2.0-flash
 *  - gemini-1.5-flash
 */
export async function transcribeAudioWithGemini(
  audioBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const ai = getGenAIClient();
  if (!ai) {
    return "Nota de voz recibida (Gemini API key no configurada o es placeholder)";
  }

  const normalizedMime = normalizeAudioMimeType(mimeType);
  const fileSizeKb = Math.round(audioBuffer.length / 1024);
  console.log(`🎙️ Transcribiendo audio: ${fileSizeKb}KB, mimeType original="${mimeType}" → normalizado="${normalizedMime}"`);

  // Modelos con soporte real de audio multimodal (en orden de disponibilidad)
  const AUDIO_MODELS = [
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  const TRANSCRIPTION_PROMPT =
    "Transcribe en español el contenido hablado en este audio o nota de voz de WhatsApp. " +
    "Si el audio es inaudible o contiene solo ruido, responde exactamente: [Audio inaudible]. " +
    "Devuelve ÚNICAMENTE el texto transcrito, sin saludos, sin explicaciones, sin comillas adicionales.";

  // ── Estrategia 1: Gemini Files API ───────────────────────────────────────
  let uploadedFileName: string | null = null;
  try {
    console.log("🔼 [transcribe] Subiendo audio con Files API...");

    // Convertir Buffer a Blob compatible con Node.js y TypeScript
    const blob = new Blob([audioBuffer as any], { type: normalizedMime });

    const uploadResult = await callWithTimeout(
      ai.files.upload({
        file: blob,
        config: { mimeType: normalizedMime },
      }),
      15000
    );

    uploadedFileName = uploadResult.name ?? null;
    console.log(`✅ [transcribe] Archivo subido: ${uploadResult.uri}`);

    // Esperar a que el archivo esté ACTIVE (max 10s)
    let fileState = uploadResult;
    let retries = 0;
    while ((fileState as any).state === "PROCESSING" && retries < 5) {
      await new Promise((r) => setTimeout(r, 2000));
      fileState = await ai.files.get({ name: uploadResult.name! });
      retries++;
    }

    if ((fileState as any).state === "FAILED") {
      throw new Error("El archivo de audio falló al procesarse en Gemini Files API");
    }

    // Generar transcripción usando fileData (referencia al archivo subido)
    for (const model of AUDIO_MODELS) {
      try {
        console.log(`🤖 [transcribe] Probando modelo ${model} con Files API...`);
        const response = await callWithTimeout(
          ai.models.generateContent({
            model,
            contents: [
              { text: TRANSCRIPTION_PROMPT },
              {
                fileData: {
                  fileUri: uploadResult.uri,
                  mimeType: normalizedMime,
                },
              },
            ] as any,
          }),
          12000
        );

        const text = response.text?.trim();
        if (text && text.length > 0) {
          console.log(`✅ [transcribe] Transcripción exitosa con ${model} (Files API): "${text.slice(0, 60)}..."`);
          // Limpiar el archivo subido (fire-and-forget)
          if (uploadedFileName) {
            ai.files.delete({ name: uploadedFileName }).catch(() => {});
          }
          return text;
        }
      } catch (modelErr: any) {
        console.warn(`⚠️ [transcribe] Modelo ${model} falló con Files API: ${modelErr?.message}`);
        continue;
      }
    }
  } catch (filesApiErr: any) {
    console.warn(`⚠️ [transcribe] Files API falló: ${filesApiErr?.message}. Intentando con inlineData...`);
    // Limpiar si se subió algo
    if (uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => {});
      uploadedFileName = null;
    }
  }

  // ── Estrategia 2: inlineData base64 (fallback para archivos pequeños) ───
  if (audioBuffer.length <= 5 * 1024 * 1024) { // Solo para archivos <5MB
    for (const model of AUDIO_MODELS) {
      try {
        console.log(`🤖 [transcribe] Probando modelo ${model} con inlineData...`);
        const response = await callWithTimeout(
          ai.models.generateContent({
            model,
            contents: [
              { text: TRANSCRIPTION_PROMPT },
              {
                inlineData: {
                  mimeType: normalizedMime,
                  data: audioBuffer.toString("base64"),
                },
              },
            ] as any,
          }),
          12000
        );

        const text = response.text?.trim();
        if (text && text.length > 0) {
          console.log(`✅ [transcribe] Transcripción exitosa con ${model} (inlineData): "${text.slice(0, 60)}..."`);
          return text;
        }
      } catch (inlineErr: any) {
        console.warn(`⚠️ [transcribe] Modelo ${model} falló con inlineData: ${inlineErr?.message}`);
        continue;
      }
    }
  }

  console.error("❌ [transcribe] Todos los métodos de transcripción fallaron");
  return "🎤 Nota de voz recibida (transcripción no disponible en este momento)";
}

/**
 * Genera una Ficha Ejecutiva de Transferencia (Handoff) para el asesor humano
 */
export async function generateHandoffSummary(
  history: ConversationMessage[],
  clientMessage: string,
  handoffReason?: string
): Promise<HandoffSummary> {
  const fallback: HandoffSummary = {
    executiveSummary: "El cliente solicitó asesoría comercial o cotización personalizada.",
    clientInterest: handoffReason || "Consulta de servicios y cotizaciones",
    urgencyLevel: "media",
    recommendedAction: "Saludar cordialmente, validar los requerimientos del proyecto y cotizar.",
  };

  if (!isGeminiKeyConfigured()) return fallback;

  try {
    const formatted = history
      .slice(-6)
      .map((m) => `${m.sender === "client" ? "Cliente" : "Asistente"}: ${m.content}`)
      .join("\n");

    const prompt = `
Historial reciente de la conversación:
${formatted}

Último mensaje recibido:
"${clientMessage}"

Razón o disparador de la transferencia:
${handoffReason || "Atención personalizada o cotización"}

Genera una ficha ejecutiva de transferencia para el asesor humano en formato JSON estricto con las siguientes claves:
{
  "executiveSummary": "Resumen conciso en 1 o 2 oraciones de lo que el cliente necesita y su contexto",
  "clientInterest": "Servicio o tema principal de interés (ej: Desarrollo Web, Bot WhatsApp, etc.)",
  "urgencyLevel": "alta" o "media" o "baja",
  "recommendedAction": "Acción directa y concreta que el asesor humano debe realizar al intervenir"
}`;

    const raw = await callGeminiWithFallback(
      prompt,
      "Eres un analista de CRM senior de Deploy. Tu tarea es resumir con alta precisión el estado y necesidad del prospecto para el asesor humano en JSON estricto."
    );

    const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
      return {
        executiveSummary: parsed.executiveSummary || fallback.executiveSummary,
        clientInterest: parsed.clientInterest || fallback.clientInterest,
        urgencyLevel: ["alta", "media", "baja"].includes(parsed.urgencyLevel)
          ? parsed.urgencyLevel
          : fallback.urgencyLevel,
        recommendedAction: parsed.recommendedAction || fallback.recommendedAction,
      };
    }
  } catch (error) {
    console.error("Error al generar resumen ejecutivo de handoff:", error);
  }

  return fallback;
}

/**
 * Motor conversacional de respaldo inteligente cuando la IA no está disponible o falla
 * Maneja temas fuera de alcance, selección de opciones y pedidos de asesor con fluidez
 */
export function getIntelligentFallback(newMessage: string): AIResponse {
  const text = (newMessage || "").toLowerCase().trim();

  // 1. Detección de temas ajenos a tecnología o software (mascotas, perros, comida, medicina, etc.)
  if (
    /perr[oa]|mascota|animal|adop|veterinar|cachorr|medic[oa]|salud|enferm|receta|comida|restaurante|abogad[oa]|zapat[oa]|ropa/i.test(
      text
    )
  ) {
    return {
      replyText:
        "¡Hola! 👋 En *Deploy* nos dedicamos **exclusivamente al desarrollo de software y soluciones tecnológicas** (páginas web, chatbots con IA para WhatsApp y automatizaciones empresariales) 🚀.\n\nActualmente no ofrecemos ni gestionamos servicios ajenos a la tecnología como el que mencionas. ¿Tienes algún requerimiento digital, sitio web o bot en el que te podamos apoyar?",
      requestHandoff: false,
    };
  }

  // 2. Opción 2 o Consulta de Servicios
  if (
    text === "2" ||
    text.startsWith("2.") ||
    text.includes("servicio") ||
    text.includes("desarrollo") ||
    text.includes("web") ||
    text.includes("landing") ||
    text.includes("chatbot") ||
    text.includes("bot") ||
    text.includes("automatiz")
  ) {
    return {
      replyText:
        "🚀 *Servicios y Soluciones Tecnológicas en Deploy:*\n\n" +
        "• 🌐 *Desarrollo Web & Landing Pages:* Páginas web de alto impacto, ultra rápidas y enfocadas en conversión.\n" +
        "• 🤖 *Chatbots de WhatsApp con IA:* Asistentes inteligentes 24/7 conectados a tu CRM y WhatsApp Cloud API.\n" +
        "• ⚙️ *Automatizaciones & Cloud:* Integraciones a medida (APIs, AppSheet) y despliegue en la nube.\n\n" +
        "¿Te gustaría que un asesor comercial revise tu proyecto o deseas más detalles de algún servicio en particular?",
      requestHandoff: false,
    };
  }

  // 3. Opción 1 o FAQs
  if (
    text === "1" ||
    text.startsWith("1.") ||
    text.includes("faq") ||
    text.includes("pregunta") ||
    text.includes("pago") ||
    text.includes("tiempo")
  ) {
    return {
      replyText:
        "📋 *Preguntas Frecuentes (FAQ) - Deploy:*\n\n" +
        "• *Modalidad de Trabajo:* Metodología ágil con entregas por fases.\n" +
        "• *Tiempos:* Landing pages listas entre 3 y 7 días hábiles según el requerimiento.\n" +
        "• *Formas de Pago:* Pago Móvil, transferencias bancarias nacionales, Binance Pay (USDT) y divisas en efectivo.\n\n" +
        "¿Deseas que te conectemos con un asesor para cotizar un requerimiento específico?",
      requestHandoff: false,
    };
  }

  // 4. Opción 3 o Soporte
  if (
    text === "3" ||
    text.startsWith("3.") ||
    text.includes("soporte") ||
    text.includes("incidencia") ||
    text.includes("falla") ||
    text.includes("problema") ||
    text.includes("error")
  ) {
    return {
      replyText:
        "🛠️ *Soporte Técnico Especializado - Deploy:*\n\n" +
        "Brindamos mantenimiento preventivo, corrección de incidencias y monitoreo de sistemas activos de Deploy.\n\n" +
        "Por favor descríbenos brevemente la situación o escribe *4* para transferirte con un técnico humano.",
      requestHandoff: false,
    };
  }

  // 5. Opción 4 o Asesor / Cotización / Precios (Handoff automático)
  if (
    text === "4" ||
    text.startsWith("4.") ||
    text.includes("asesor") ||
    text.includes("humano") ||
    text.includes("persona") ||
    text.includes("cotiz") ||
    text.includes("precio") ||
    text.includes("costo") ||
    text.includes("presupuesto") ||
    text.includes("contratar")
  ) {
    return {
      replyText:
        "¡Con mucho gusto! 🤝 Te estoy transfiriendo en este momento con uno de nuestros asesores comerciales para darte una atención personalizada y revisar los requerimientos de tu proyecto.",
      requestHandoff: true,
      handoffReason: "Solicitud directa de asesor o cotización",
    };
  }

  // 6. Saludo inicial o petición de menú explícito
  return {
    replyText:
      "¡Hola! 👋 Bienvenido a *Deploy*. Somos especialistas en desarrollo de software, sitios web y chatbots con Inteligencia Artificial.\n\n" +
      "📌 *¿En qué te podemos colaborar hoy?*\n" +
      "1️⃣ *FAQ:* Preguntas frecuentes y formas de pago\n" +
      "2️⃣ *Servicios:* Desarrollo web, chatbots y automatizaciones\n" +
      "3️⃣ *Soporte:* Incidencias y diagnóstico técnico\n" +
      "4️⃣ *Asesor:* Conectar con un especialista humano\n\n" +
      "*(Escribe el número de la opción que prefieras o cuéntanos tu proyecto)* 🚀",
    requestHandoff: false,
  };
}

export async function generateAIResponse(
  history: ConversationMessage[],
  newMessage: string
): Promise<AIResponse> {
  if (!isGeminiKeyConfigured()) {
    console.warn("ℹ️ GEMINI_API_KEY no configurada o es placeholder. Respondiendo mediante motor inteligente integrado.");
    return getIntelligentFallback(newMessage);
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

INSTRUCCIONES CLAVE DE ATENCIÓN:
1. FLUIDEZ Y NATURALIDAD: Sé empático, ágil, humano y profesional. Responde directamente a lo que el cliente plantea de forma fluida.
2. NUNCA REPITAS EL MENÚ EN CADA MENSAJE: Si el cliente ya eligió una opción o está conversando, responde directamente al tema seleccionado y formula una pregunta de seguimiento para avanzar. NO copies y pegues el menú de opciones (1, 2, 3, 4) a menos que el cliente explícitamente escriba 'menú' o sea el primer mensaje de la conversación.
3. ESTRICTO ALCANCE DE DEPLOY: En Deploy nos dedicamos EXCLUSIVAMENTE al desarrollo de software y tecnología (sitios web, chatbots con IA para WhatsApp, automatizaciones y soporte en la nube). Si el cliente pregunta por un tema ajeno (ej: adoptar o comprar perros/animales, medicina, comida, etc.), aclara con respeto y cortesía que en Deploy solo ofrecemos soluciones tecnológicas y desarrollo de software, y pregunta si tiene alguna necesidad tecnológica para su negocio.
4. Genera la respuesta en el formato JSON indicado.`;

    const text = await callGeminiWithFallback(prompt);

    return extractCleanReply(text);
  } catch (error) {
    console.error("Error al generar respuesta con Gemini, usando respuesta inteligente de respaldo:", error);
    return getIntelligentFallback(newMessage);
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