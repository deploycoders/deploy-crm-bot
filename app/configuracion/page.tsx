"use client";

import {
  Bot,
  CheckCircle2,
  Database,
  Globe,
  KeyRound,
  MessageSquare,
  Phone,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function ConfiguracionPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <div className="flex items-center gap-2">
          <Settings className="size-4 text-signal" />
          <p className="text-xs font-semibold tracking-wider uppercase text-signal">
            Ajustes de Infraestructura
          </p>
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
          Configuración del Sistema
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Supervisa el estado de la API de WhatsApp, la Inteligencia Artificial y la base de datos en tiempo real.
        </p>
      </header>

      {/* Grid de Estado de Servicios */}
      <section className="grid gap-6 md:grid-cols-3">
        {/* WhatsApp Cloud API */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Phone className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              <CheckCircle2 className="size-3" />
              Conectado
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">WhatsApp Cloud API</h3>
            <p className="text-xs text-slate-400 mt-0.5">Meta Graph API v22.0</p>
          </div>

          <div className="space-y-2 text-xs border-t border-line pt-3 text-slate-300">
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Número Oficial:</span>
              <span className="font-mono text-white">+58 422-5220381</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Phone ID:</span>
              <span className="font-mono text-slate-300">1304775179385550</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Modo de Envío:</span>
              <span className="text-emerald-400">Producción Directa</span>
            </div>
          </div>
        </article>

        {/* Gemini AI Engine */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-signal/10 text-signal border border-signal/20">
              <Sparkles className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-signal/25 bg-signal/10 px-2.5 py-0.5 text-xs font-medium text-signal">
              <CheckCircle2 className="size-3" />
              Operativo
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Google Gemini Engine</h3>
            <p className="text-xs text-slate-400 mt-0.5">SDK Oficial @google/genai</p>
          </div>

          <div className="space-y-2 text-xs border-t border-line pt-3 text-slate-300">
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Modelo Activo:</span>
              <span className="font-mono text-signal">gemini-3.5-flash</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Respaldo / Fallback:</span>
              <span className="font-mono text-slate-300">gemini-3.7-flash</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Handoff Humano:</span>
              <span className="text-emerald-400">Detección Automática</span>
            </div>
          </div>
        </article>

        {/* Supabase Database */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Database className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-400">
              <CheckCircle2 className="size-3" />
              Sincronizado
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Supabase Cloud</h3>
            <p className="text-xs text-slate-400 mt-0.5">PostgreSQL + Realtime Channel</p>
          </div>

          <div className="space-y-2 text-xs border-t border-line pt-3 text-slate-300">
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Instancia:</span>
              <span className="font-mono text-slate-300">ljlohjuctcrlhsnyedeq</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Tablas:</span>
              <span className="text-white">contacts, conversations, messages</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Websockets:</span>
              <span className="text-sky-400">Live Updates Activo</span>
            </div>
          </div>
        </article>
      </section>

      {/* Visor de Prompt y Reglas del Bot */}
      <section className="rounded-xl border border-line bg-panel/70 p-6 shadow-2xl backdrop-blur-xl space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Bot className="size-4 text-signal" />
              Personalidad y Menú del Bot (Antigravity Customer Support)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Instrucciones y estructura de respuestas configuradas para Deploy en WhatsApp.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400 border border-line rounded-lg px-2.5 py-1 bg-white/5">
            lib/ai.ts
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 text-xs">
          <div className="space-y-3 rounded-lg border border-line bg-black/30 p-4">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-signal" />
              Menú Principal Presentado al Cliente:
            </h4>
            <ul className="space-y-2 text-slate-300">
              <li className="flex items-start gap-2">
                <span className="text-signal font-bold">1️⃣</span>
                <span><b>Preguntas Frecuentes (FAQ):</b> Tiempos de entrega, formas de pago y contratación.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-signal font-bold">2️⃣</span>
                <span><b>Productos y Servicios:</b> Webs, landing pages, automatizaciones n8n/AppSheet y Cloud.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-signal font-bold">3️⃣</span>
                <span><b>Soporte Técnico (Troubleshooting):</b> Diagnóstico de errores e incidencias en sistemas.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-signal font-bold">4️⃣</span>
                <span><b>Hablar con Asesor Humano:</b> Transferencia inmediata al CRM (Handoff queue).</span>
              </li>
            </ul>
          </div>

          <div className="space-y-3 rounded-lg border border-line bg-black/30 p-4">
            <h4 className="font-semibold text-white flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-signal" />
              Reglas de Seguridad y Negocio (Guardrails):
            </h4>
            <ul className="space-y-2 text-slate-300">
              <li>• <b>Enfoque Tecnológico:</b> Solo responde sobre desarrollo, software, automatizaciones y tecnología de Deploy.</li>
              <li>• <b>Concisión en WhatsApp:</b> Mensajes cortos de 2 a 3 oraciones para fácil lectura móvil.</li>
              <li>• <b>Deduplicación:</b> Protección contra mensajes dobles por reintentos de Meta en red.</li>
              <li>• <b>Transferencia Fluida:</b> Si el lead pide hablar con una persona o quiere cotizar un contrato formal, se activa el handoff humano en el CRM.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
