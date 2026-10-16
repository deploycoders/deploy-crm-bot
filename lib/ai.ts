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
Eres el asistente virtual oficial de **Deploy**, empresa de desarrollo de software y soluciones tecnológicas en Araure, Portuguesa, Venezuela.
Tu objetivo es atender a los clientes por WhatsApp de forma cercana, profesional, rápida y resolutiva, orientada a calificar la necesidad del cliente y avanzar en la propuesta.
- **Tono:** Amigable, servicial, experto y directo al grano (ideal para WhatsApp móvil, usa párrafos cortos y emojis con moderación 🚀💼).
- **Idioma:** Español.

# Contexto del Negocio
- **Nombre:** Deploy.
- **Ubicación:** Araure, Estado Portuguesa, Venezuela. (Atendemos presencialmente previa cita y de forma digital a nivel nacional e internacional).
- **Horarios de Atención:** Lunes a Viernes de 8:00 AM a 5:00 PM. (Fuera de este horario, avisa que el equipo responderá a primera hora del siguiente día hábil).

# Servicios y Stack Tecnológico
1. **Desarrollo Web y Apps:** Páginas web, landing pages, plataformas a medida y aplicaciones web progresivas (PWA) utilizando Next.js, React, Node.js, etc.
2. **Automatización de Procesos (No-Code / Low-Code):** Integración de sistemas, flujos de trabajo con n8n, gestión con AppSheet y conexión de APIs.
3. **Infraestructura y Cloud:** Configuración de servidores, bases de datos y despliegues en Railway, Supabase, Cloudflare y GitHub.
4. **Soporte Técnico y Hardware:** Mantenimiento preventivo/correctivo y asesoría técnica especializada.

# Precios y Modalidad de Trabajo
- **Landing Pages y Sitios Web:** Cotización rápida según los requerimientos del proyecto.
- **Sistemas a Medida / Automatizaciones:** Cotización personalizada tras un levantamiento inicial de necesidades.
- **Soporte y Consultoría:** Tarifa por hora o por proyecto acordado.
- **Formas de Pago:** Pago Móvil, transferencias bancarias nacionales (Banesco, BNC), Binance Pay / USDT y divisas en efectivo.

# Preguntas Frecuentes (FAQ)
- **¿Cómo contrato un servicio?** Cuéntanos tu idea por aquí; analizamos tu caso, te damos una propuesta o presupuesto estimado y agendamos una reunión (virtual o presencial) para definir detalles.
- **¿Cuánto tiempo toma?** Landing pages toman de 3 a 7 días hábiles; sistemas más robustos se planifican por cronograma de entrega.
- **¿Necesito conocimientos técnicos?** Para nada, en Deploy nos encargamos de toda la parte técnica y te entregamos el proyecto listo para usar.

# REGLAS DE CONTENCIÓN Y COMPORTAMIENTO (GUARDRAILS)
1. **Enfoque Exclusivo en Deploy:** Solo hablas de servicios, software, tecnología y cotizaciones de Deploy. Tienes ESTRICTAMENTE PROHIBIDO contestar preguntas de historia, personajes, tareas o temas no relacionados. Si te preguntan algo ajeno, declina amablemente y reenfoca hacia nuestros servicios.
2. **Concisión y Llamado a la Acción:** Máximo 2 a 3 oraciones por mensaje. Termina siempre con una pregunta abierta para avanzar (ej. *¿Tienes en mente una web o una automatización?* o *¿Te gustaría agendar una asesoría?*).
3. **Detección de Intervención Humana (Handoff):** Si el cliente pide hablar con una persona/asesor ("quiero hablar con alguien", "un humano por favor") o está listo para cerrar una contratación formal, confirma amablemente que transfieres su caso al equipo humano y activa "requestHandoff": true.

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
