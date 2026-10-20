"use client";

import {
  BellRing,
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
import { playMessageChime, playHandoffAlert, initAudio } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";

export default function ConfiguracionPage() {
  const { user } = useAuth();
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

      {/* Card de Sesión Activa y Permisos de Administrador */}
      <section className="rounded-xl border border-signal/30 bg-panel/80 p-5 shadow-glow backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-signal/15 text-signal border border-signal/30">
              <ShieldCheck className="size-6" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">
                  Sesión Activa: {user?.name || "Jesús"}
                </h2>
                <span className="rounded-full bg-signal/15 border border-signal/30 px-2.5 py-0.5 text-[11px] font-semibold text-signal">
                  Super Administrador
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {user?.email || "admin@salesbot.crm"} • Autenticado en Supabase Auth (auth.users) con Acceso Total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400">
              <CheckCircle2 className="size-4" />
              100% Permisos Habilitados
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">WhatsApp API</p>
            <p className="font-semibold text-signal mt-0.5">Control Total</p>
          </div>
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">Agente Gemini</p>
            <p className="font-semibold text-signal mt-0.5">Control Total</p>
          </div>
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">Handoff Chats</p>
            <p className="font-semibold text-signal mt-0.5">Control Total</p>
          </div>
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">DB Supabase</p>
            <p className="font-semibold text-signal mt-0.5">Control Total</p>
          </div>
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">Contactos</p>
            <p className="font-semibold text-signal mt-0.5">Control Total</p>
          </div>
          <div className="rounded-lg border border-line bg-ink/50 p-2.5 text-center">
            <p className="text-slate-400 text-[10px] uppercase font-medium">Webhooks</p>
            <p className="font-semibold text-signal mt-0.5">Acceso Libre</p>
          </div>
        </div>
      </section>

      {/* Grid de Estado de Servicios */}
      <section className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
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
              <span className="font-mono text-signal">gemini-3.1-flash-lite</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Respaldo / Fallback:</span>
              <span className="font-mono text-slate-300">gemini-3.8-flash</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Espera Debounce:</span>
              <span className="font-mono text-emerald-400">3.5s (Serverless Safe)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Handoff Humano:</span>
              <span className="text-emerald-400">Solo si lo elige o venta segura</span>
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

        {/* Notificaciones y Alertas Sonoras */}
        <article className="rounded-xl border border-line bg-panel/70 p-5 shadow-xl backdrop-blur-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <BellRing className="size-5" />
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-400">
              <CheckCircle2 className="size-3" />
              Web Audio
            </span>
          </div>

          <div>
            <h3 className="text-base font-semibold text-white">Alertas & Sonido</h3>
            <p className="text-xs text-slate-400 mt-0.5">Mensajes y Handoff a Asesor</p>
          </div>

          <div className="space-y-2 text-xs border-t border-line pt-3 text-slate-300">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Mensajes Entrantes:</span>
              <button
                type="button"
                onClick={() => {
                  initAudio().then(() => playMessageChime());
                }}
                className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition"
              >
                🔔 Probar Chime
              </button>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Alerta de Asesor:</span>
              <button
                type="button"
                onClick={() => {
                  initAudio().then(() => playHandoffAlert());
                }}
                className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-300 hover:bg-rose-500/20 transition"
              >
                🚨 Probar Alerta
              </button>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Escritorio:</span>
              <span className="text-emerald-400 font-medium">Toasts & Desktop API</span>
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
              <li>• <b>Espera Inteligente (Debounce 3.5s):</b> El bot espera a que el cliente termine de escribir para consolidar múltiples mensajes consecutivos y responder todo en un único mensaje.</li>
              <li>• <b>Menú Permanente:</b> Mantiene activo el menú principal (1️⃣ FAQ, 2️⃣ Servicios, 3️⃣ Soporte, 4️⃣ Asesor) o un pie de navegación en cada interacción.</li>
              <li>• <b>Enfoque Tecnológico:</b> Solo responde sobre desarrollo, software, automatizaciones y tecnología de Deploy.</li>
              <li>• <b>Deduplicación:</b> Protección contra mensajes dobles por reintentos de Meta en red.</li>
              <li>• <b>Transferencia a Asesor:</b> Pasa a asesor si el cliente lo solicita explícitamente (Opción 4) o al pedir precios y cotizaciones (atención personalizada).</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
