import { GoogleGenAI } from "@google/genai";
import { getActiveBotConfig, buildDynamicSystemPrompt } from "./botConfig";

const apiKey = process.env.GEMINI_API_KEY || "";

const ai = new GoogleGenAI({ apiKey });

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
  if (!apiKey) {
    return "Nota de voz recibida (Gemini API key no configurada)";
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

  if (!apiKey) return fallback;

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