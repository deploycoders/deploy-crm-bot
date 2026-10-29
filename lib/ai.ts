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
const GEMINI_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
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
        15000
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
 */
function normalizeAudioMimeType(rawMime: string): string {
  const base = rawMime.split(";")[0].trim().toLowerCase();

  const mimeMap: Record<string, string> = {
    "audio/opus": "audio/ogg",
    "audio/mpeg": "audio/mp3",
    "audio/mp4": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/ogg": "audio/ogg",
    "audio/wav": "audio/wav",
    "audio/wave": "audio/wav",
    "audio/flac": "audio/flac",
    "audio/aac": "audio/aac",
    "audio/aiff": "audio/aiff",
    "audio/x-aiff": "audio/aiff",
  };

  return mimeMap[base] ?? "audio/ogg";
}

/**
 * Transcribe un audio o nota de voz de WhatsApp usando Google Gemini.
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

  const AUDIO_MODELS = [
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ];

  const TRANSCRIPTION_PROMPT =
    "Transcribe en español el contenido hablado en este audio o nota de voz de WhatsApp. " +
    "Si el audio es inaudible o contiene solo ruido, responde exactamente: [Audio inaudible]. " +
    "Devuelve ÚNICAMENTE el texto transcrito, sin saludos, sin explicaciones, sin comillas adicionales.";

  let uploadedFileName: string | null = null;
  try {
    const blob = new Blob([audioBuffer as any], { type: normalizedMime });

    const uploadResult = await callWithTimeout(
      ai.files.upload({
        file: blob,
        config: { mimeType: normalizedMime },
      }),
      15000
    );

    uploadedFileName = uploadResult.name ?? null;

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

    for (const model of AUDIO_MODELS) {
      try {
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
          if (uploadedFileName) {
            ai.files.delete({ name: uploadedFileName }).catch(() => { });
          }
          return text;
        }
      } catch {
        continue;
      }
    }
  } catch {
    if (uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => { });
      uploadedFileName = null;
    }
  }

  if (audioBuffer.length <= 5 * 1024 * 1024) {
    for (const model of AUDIO_MODELS) {
      try {
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
          return text;
        }
      } catch {
        continue;
      }
    }
  }

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
 * Motor conversacional de respaldo inteligente cuando la IA no está disponible
 */
export function getIntelligentFallback(
  newMessage: string,
  history: ConversationMessage[] = []
): AIResponse {
  const text = (newMessage || "").toLowerCase().trim();
  const recentContext = history.slice(-6).map((message) => message.content.toLowerCase()).join(" ");
  const context = `${recentContext} ${text}`;

  if (/receta|cocina|perr[oa]|mascota|veterinar|medic[oa]|salud|enferm|abogad[oa]|pol[ií]tica|religión/i.test(text)) {
    return {
      replyText: "Soy el asistente de Deploy y puedo ayudarte con servicios, páginas web, automatizaciones y proyectos tecnológicos. ¿Qué necesitas para tu negocio?",
      requestHandoff: false,
    };
  }

  if (/asesor|humano|persona real|llamarme|contáctenme|contactarme/.test(text)) {
    return {
      replyText: "Claro, gestionaré tu solicitud con el equipo comercial para que puedan atenderte de forma personalizada.",
      requestHandoff: true,
      handoffReason: "El cliente solicitó atención humana",
    };
  }

  if (/quiero contratar|quiero comprar|quiero comenzar|iniciar el proyecto|cotización personalizada|presupuesto formal|propuesta formal/.test(text)) {
    return {
      replyText: "Excelente. Para preparar una propuesta adecuada, gestionaré tu solicitud con el equipo comercial.",
      requestHandoff: true,
      handoffReason: "Intención de contratación o cotización personalizada",
    };
  }

  if (/cuánto tarda|cuanto tarda|tiempo de entrega|plazo/.test(text)) {
    if (/landing|página|pagina|web|sitio/.test(context)) {
      return { replyText: "El tiempo depende del alcance. Como referencia, una landing page suele entregarse entre 3 y 7 días hábiles; una web corporativa puede requerir más según sus secciones y funciones. ¿Qué tipo de página necesitas?", requestHandoff: false };
    }
    return { replyText: "El tiempo de entrega depende del alcance y las funcionalidades del proyecto. ¿Sobre cuál servicio o proyecto quieres conocer el plazo?", requestHandoff: false };
  }

  if (/precio|precios|cuánto cuesta|cuanto cuesta|presupuesto|cotización|cotizacion/.test(text)) {
    if (/landing|página|pagina|web|sitio/.test(context)) {
      return { replyText: "El costo de una página web depende de las secciones, diseño y funcionalidades necesarias. Para orientarte mejor, ¿buscas una landing page para captar clientes o una web corporativa con varias secciones?", requestHandoff: false };
    }
    return { replyText: "El precio depende del alcance del proyecto. Cuéntame qué necesitas automatizar, desarrollar o mejorar y te orientaré con los datos necesarios para cotizarlo.", requestHandoff: false };
  }

  if (/página|pagina|sitio web|web corporativa|landing/.test(text)) {
    return { replyText: "Sí, podemos desarrollar una página ejecutiva para tu empresa, adaptada a móviles y enfocada en presentar tus servicios. ¿Buscas una landing page para captar contactos o una web corporativa con secciones como servicios, nosotros y contacto?", requestHandoff: false };
  }

  if (/chatbot|whatsapp|bot/.test(text)) {
    return { replyText: "Podemos crear un chatbot para WhatsApp que atienda consultas frecuentes, califique clientes y automatice procesos según tu negocio. ¿Qué tipo de mensajes o tareas quieres automatizar?", requestHandoff: false };
  }

  if (/automat|integraci|api|pedido|crm|proceso/.test(text)) {
    return { replyText: "Sí, podemos evaluar una automatización para reducir tareas repetitivas e integrar tus procesos. ¿Qué ocurre hoy y qué resultado te gustaría automatizar?", requestHandoff: false };
  }

  if (/^(hola|buenas|buenos días|buenas tardes|buenas noches)[!. ]*$/i.test(text)) {
    return { replyText: "¡Hola! Soy el asistente de Deploy. Puedo ayudarte con páginas web, software, chatbots y automatizaciones. ¿Qué necesitas para tu negocio?", requestHandoff: false };
  }

  return { replyText: "Gracias por contarnos. Para orientarte mejor, ¿qué objetivo tiene tu proyecto o qué problema de tu negocio te gustaría resolver?", requestHandoff: false };
}

export async function generateAIResponse(
  history: ConversationMessage[],
  newMessage: string
): Promise<AIResponse> {
  if (!isGeminiKeyConfigured()) {
    console.warn("ℹ️ GEMINI_API_KEY no configurada. Respondiendo mediante motor inteligente integrado.");
    return getIntelligentFallback(newMessage, history);
  }

  try {
    const formattedHistory = history
      .filter((m) => m.sender !== "system")
      .map((m) => `${m.sender === "client" ? "Cliente" : "Asistente"}: ${m.content}`)
      .join("\n");

    // La política vive exclusivamente en el system prompt. Este contenido es
    // contexto no confiable delimitado, no instrucciones para el modelo.
    const prompt = `
<conversation_history>
${formattedHistory || "(Sin mensajes anteriores)"}
</conversation_history>

<latest_client_message>
${newMessage}
</latest_client_message>

Resuelve la consulta usando el historial y devuelve el JSON requerido.`;
    const text = await callGeminiWithFallback(prompt);

    return extractCleanReply(text);
  } catch (error) {
    console.error("Error al generar respuesta con Gemini, usando respuesta inteligente de respaldo:", error);
    return getIntelligentFallback(newMessage, history);
  }
}

export function cleanJsonArtifacts(text: string): string {
  if (!text) return "";
  let s = text.trim();

  s = s.replace(/```json/gi, "").replace(/```/g, "").trim();

  if (s.includes('"replyText"')) {
    const regex = /"replyText"\s*:\s*"([\s\S]*?)"(?:\s*,\s*"requestHandoff"|\s*,\s*"handoffReason"|\s*})/i;
    const match = s.match(regex);
    if (match && match[1]) {
      s = match[1];
    } else {
      s = s
        .replace(/^\{\s*"replyText"\s*:\s*"/i, "")
        .replace(/"\s*,\s*"requestHandoff"[\s\S]*$/i, "")
        .replace(/"\s*\}$/, "");
    }
  }

  s = s
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .trim();

  return s;
}

export function extractCleanReply(rawText: string): AIResponse {
  const fallbackText =
    "¡Hola! Bienvenido a Deploy 🚀\n\n¿En qué te podemos colaborar hoy con tus proyectos tecnológicos o desarrollo de software?";

  if (!rawText || !rawText.trim()) {
    return { replyText: fallbackText, requestHandoff: false };
  }

  const cleaned = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

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
    // Continuar con regex
  }

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
    // Continuar al fallback
  }

  return {
    replyText: cleanJsonArtifacts(cleaned) || fallbackText,
    requestHandoff: /"requestHandoff"\s*:\s*true/i.test(cleaned),
    handoffReason: undefined,
  };
}
