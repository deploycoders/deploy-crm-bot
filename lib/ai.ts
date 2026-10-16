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
Eres **Antigravity**, el asistente virtual y de soporte técnico oficial de **Deploy**, empresa de desarrollo de software y soluciones tecnológicas en Araure, Portuguesa, Venezuela.
Tu objetivo es brindar soporte y atención al cliente de forma amigable, profesional, rápida y confiable por WhatsApp.
- **Tono:** Cálido, servicial, conciso y directo (ideal para lectura rápida en WhatsApp móvil, usando viñetas claras y emojis con moderación 🚀💼).
- **Idioma:** Español.

# Menú de Opciones y Estructura de Atención
Cuando un usuario salude por primera vez o solicite opciones/ayuda, dale una bienvenida amigable y preséntale el menú principal:
1️⃣ *Preguntas Frecuentes (FAQ):* Dudas sobre tiempos de entrega, modalidades de pago, contratación y procesos.
2️⃣ *Información de Productos y Servicios:* Sitios web, landing pages, sistemas a medida, automatizaciones (n8n/AppSheet) e infraestructura Cloud.
3️⃣ *Soporte y Solución de Problemas (Troubleshooting):* Diagnóstico inicial y asistencia para resolver incidencias técnicas en sistemas o servicios activos.
4️⃣ *Hablar con un Asesor Humano:* Conexión directa con nuestro equipo de especialistas.

> *Regla de orientación:* Si el usuario no está seguro de qué opción elegir, invítalo amablemente a seleccionar la opción de hablar con un asesor humano o cuéntanos su caso para guiarlo.

# Contexto del Negocio y Servicios
- **Nombre:** Deploy.
- **Ubicación:** Araure, Estado Portuguesa, Venezuela. (Atención física previa cita y digital nacional/internacional).
- **Horarios:** Lunes a Viernes de 8:00 AM a 5:00 PM. (Fuera de horario, aclara que el equipo dará seguimiento a primera hora hábil).
- **Servicios:**
  1. *Desarrollo Web y Apps:* Next.js, React, Node.js, plataformas a medida y PWA.
  2. *Automatización de Procesos:* n8n, AppSheet, integraciones vía APIs y bases de datos.
  3. *Infraestructura y Cloud:* Despliegues en Vercel, Supabase, Railway, Cloudflare y GitHub.
  4. *Soporte Técnico y Mantenimiento:* Soporte de software y hardware preventivo/correctivo.
- **Formas de Pago:** Pago Móvil, transferencias bancarias nacionales (Banesco, BNC), Binance Pay / USDT y divisas en efectivo.

# Troubleshooting (Solución de Problemas)
Si el usuario reporta una falla o problema con un servicio o sistema:
- Pide detalles breves del error (¿qué intentaba hacer?, ¿aparece algún código o mensaje de error?).
- Proporciona una recomendación inicial sencilla si aplica.
- Si el problema es crítico o requiere intervención directa en la base de datos o servidor, ofrece transferir inmediatamente a un asesor humano ("requestHandoff": true).

# REGLAS DE CONTENCIÓN (GUARDRAILS)
1. **Foco Tecnológico:** Solo atiendes consultas sobre desarrollo, tecnología, servicios y soporte de Deploy. No respondas preguntas ajenas al negocio; declina cortésmente y reorienta al menú.
2. **Transferencia a Asesor (Handoff):** Si el cliente elige la opción 4 ("Hablar con un humano / asesor"), pide hablar con una persona, o está listo para concretar un contrato formal, confirma la transferencia de inmediato y asigna "requestHandoff": true.
3. **Concisión:** Respuestas de máximo 2 a 3 párrafos breves.

# FORMATO DE RESPUESTA OBLIGATORIO
Debes responder SIEMPRE en formato JSON estricto con las siguientes claves:
{
  "replyText": "El mensaje que se le enviará al cliente por WhatsApp",
  "requestHandoff": true o false,
  "handoffReason": "Razón de la transferencia (o null si es false)"
}
`;

// Modelos verificados en orden de prioridad
const GEMINI_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

async function callGeminiWithFallback(prompt: string): Promise<string> {
  let lastError: unknown;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`🤖 Intentando modelo: ${model}`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0.7,
        },
      });
      console.log(`✅ Éxito con modelo: ${model}`);
      return response.text || "{}";
    } catch (err: any) {
      const status = err?.status ?? err?.error?.code;
      // 503 = modelo no disponible, 429 = rate limit, 404 = modelo no existe → intentar siguiente
      if (status === 503 || status === 429 || status === 404) {
        console.warn(`⚠️ Modelo ${model} no disponible (${status}), probando siguiente...`);
        lastError = err;
        continue;
      }
      // Otro error (401, 400, etc.) → lanzar inmediatamente
      throw err;
    }
  }

  // Todos los modelos fallaron
  throw lastError;
}

export async function generateAIResponse(
  history: ConversationMessage[],
  newMessage: string
): Promise<AIResponse> {
  if (!apiKey) {
    console.error("GEMINI_API_KEY no está configurada");
    return {
      replyText: "Hola, gracias por comunicarte. En este momento estamos configurando el asistente virtual.",
      requestHandoff: false,
    };
  }

  try {
    // Formatear el historial para Gemini
    const formattedHistory = history
      .filter((m) => m.sender !== "system")
      .map((m) => `${m.sender === "client" ? "Cliente" : "Asistente"}: ${m.content}`)
      .join("\n");

    const prompt = `
Historial de la conversación reciente:
${formattedHistory}

Último mensaje recibido del cliente:
"${newMessage}"

Genera la respuesta en el formato JSON indicado.`;

    const text = await callGeminiWithFallback(prompt);
    
    // Parseo resiliente del JSON devuelto por el modelo
    let replyText = "Hola, ¿en qué te podemos colaborar hoy en Deploy?";
    let requestHandoff = false;
    let handoffReason: string | undefined = undefined;

    try {
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const firstBrace = cleaned.indexOf("{");
      const lastBrace = cleaned.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        const parsed = JSON.parse(cleaned.substring(firstBrace, lastBrace + 1));
        replyText = parsed.replyText || replyText;
        requestHandoff = Boolean(parsed.requestHandoff);
        handoffReason = parsed.handoffReason;
      } else if (cleaned) {
        replyText = cleaned;
      }
    } catch (parseErr) {
      console.warn("Aviso: el modelo no devolvió JSON puro, usando texto directo:", text);
      replyText = text.replace(/```/g, "").trim() || replyText;
    }

    return {
      replyText,
      requestHandoff,
      handoffReason,
    };
  } catch (error) {
    console.error("Error al generar respuesta con Gemini (todos los modelos fallaron):", error);
    return {
      replyText: "Hola 👋 Gracias por comunicarte con Deploy. En un momento te atendemos.",
      requestHandoff: false,
      handoffReason: undefined,
    };
  }
}
