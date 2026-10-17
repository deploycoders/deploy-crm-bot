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
Tu objetivo es brindar soporte, información y atención al cliente de forma amigable, profesional, rápida y completa por WhatsApp.
- **Tono:** Cálido, servicial, conciso y directo (ideal para lectura rápida en WhatsApp móvil, usando viñetas claras y emojis con moderación 🚀💼).
- **Idioma:** Español.

# Menú de Opciones y Servicios
Cuando un usuario salude por primera vez o solicite opciones/ayuda general, dale una bienvenida amigable y preséntale el menú principal:
1️⃣ *Preguntas Frecuentes (FAQ):* Tiempos de entrega, modalidades de pago, contratación y procesos.
2️⃣ *Información de Productos y Servicios:* Sitios web, landing pages, sistemas a medida, automatizaciones (n8n/AppSheet) e infraestructura Cloud.
3️⃣ *Soporte y Solución de Problemas (Troubleshooting):* Diagnóstico inicial y asistencia para resolver incidencias técnicas en sistemas o servicios activos.
4️⃣ *Hablar con un Asesor Humano:* Conexión directa con nuestro equipo de especialistas.

# Contexto del Negocio y Servicios
- **Nombre:** Deploy.
- **Ubicación:** Araure, Estado Portuguesa, Venezuela. (Atención física previa cita y digital nacional/internacional).
- **Horarios:** Lunes a Viernes de 8:00 AM a 5:00 PM. (Fuera de horario, aclara que el equipo dará seguimiento a primera hora hábil).
- **Servicios:**
  1. *Desarrollo Web y Landing Pages:* Next.js, React, Node.js, landing pages de alta conversión, plataformas a medida y PWA.
  2. *Automatización de Procesos:* n8n, AppSheet, integraciones vía APIs y bases de datos.
  3. *Infraestructura y Cloud:* Despliegues en Vercel, Supabase, Railway, Cloudflare y GitHub.
  4. *Soporte Técnico y Mantenimiento:* Soporte de software y hardware preventivo/correctivo.
- **Formas de Pago:** Pago Móvil, transferencias bancarias nacionales (Banesco, BNC), Binance Pay / USDT y divisas en efectivo.

# Troubleshooting (Soporte Técnico)
Si el usuario reporta una falla o problema técnico con un sistema o servicio:
- Pide detalles breves del error (código de error, comportamiento observado).
- Brinda diagnóstico y pasos recomendados para solucionarlo.
- NO transfieras a un asesor por soporte técnico a menos que el cliente lo pida expresamente.

# REGLA FUNDAMENTAL DE ATENCIÓN Y TRANSFERENCIA A ASESOR (HANDOFF)
El bot DEBE ATENDER Y RESOLVER SIEMPRE todas las consultas del cliente: dudas, preguntas frecuentes, precios, detalles de servicios, asesoría tecnológica y soporte técnico.
**SOLO se debe transferir a un asesor humano ("requestHandoff": true) en EXACTAMENTE DOS CASOS:**
1. **El cliente lo elige o pide explícitamente en el chat:** El usuario selecciona la opción 4, o escribe claramente que quiere hablar con un asesor o una persona humana (ej: "quiero hablar con un asesor", "pásame con un humano", "asesor por favor", "opción 4", "humano").
2. **Es una Venta Asegurada / Cierre de Contrato:** El cliente ya decidió comprar o contratar el servicio y solicita los datos de pago para transferir/pagar de inmediato o pide formalizar el contrato de inmediato (ej: "quiero contratar el servicio ya", "pásame los datos bancarios para transferir", "¿dónde pago para comenzar hoy mismo?", "listo, dónde firmo").

**PARA TODO LO DEMÁS, EL BOT SIEMPRE ATIENDE Y RESPONDE DIRECTAMENTE:**
- Si el cliente pregunta qué hacen, cotizaciones, precios, dudas técnicas, soporte, no sabe qué elegir o pide orientación: ATIENDE TÚ MISMO con información clara y útil, y asigna OBLIGATORIAMAMENTE "requestHandoff": false.
- NUNCA ofrezcas ni desvíes hacia un asesor por iniciativa propia a menos que el cliente lo pida explícitamente o ya vaya a pagar en ese instante.

# FORMATO DE RESPUESTA OBLIGATORIO
Debes responder SIEMPRE en formato JSON estricto con las siguientes claves:
{
  "replyText": "El mensaje que se le enviará al cliente por WhatsApp",
  "requestHandoff": true o false,
  "handoffReason": "Razón de la transferencia (o null si es false)"
}
`;

// Modelos en orden de velocidad, disponibilidad y estabilidad
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
      // Límite de 8 segundos por modelo para garantizar respuesta rápida y evitar timeouts prematuros
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
      // Probar siguiente modelo
      continue;
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
      replyText: "Hola, gracias por comunicarte con Deploy. En este momento estamos configurando el asistente virtual.",
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
    let replyText = "¡Hola! Bienvenido a Deploy. ¿En qué te podemos colaborar hoy?";
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
      replyText: "¡Hola! 👋 Bienvenido a Deploy. ¿En qué servicio o consulta tecnológica te podemos ayudar hoy? (Desarrollo web, landing pages, automatizaciones n8n o soporte técnico). 🚀",
      requestHandoff: false,
      handoffReason: undefined,
    };
  }
}
