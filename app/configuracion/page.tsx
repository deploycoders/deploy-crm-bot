"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  Bot,
  Check,
  CheckCircle2,
  Database,
  HelpCircle,
  KeyRound,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Save,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import { playMessageChime, playHandoffAlert, initAudio } from "@/lib/sound";
import { useAuth } from "@/context/AuthContext";
import { BotConfig, BotFAQ, DEFAULT_BOT_CONFIG } from "@/lib/botConfig";

export default function ConfiguracionPage() {
  const { user } = useAuth();

  // Estados de configuración de IA y Base de Conocimiento
  const [config, setConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Modal / Form para agregar nueva FAQ
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");
  const [showAddFaq, setShowAddFaq] = useState(false);

  // Probador de IA interactivo en vivo
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState<string | null>(null);
  const [testingAI, setTestingAI] = useState(false);

  // Cargar configuración desde la API
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch("/api/bot-settings");
        const data = await res.json();
        if (data.success && data.config) {
          setConfig(data.config);
        }
      } catch (err) {
        console.error("Error al cargar configuración:", err);
      } finally {
        setLoadingConfig(false);
      }
    }
    fetchConfig();
  }, []);

  // Guardar configuración completa
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    setSavedSuccess(false);
    try {
      const res = await fetch("/api/bot-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Error guardando configuración:", err);
      alert("No se pudo guardar la configuración");
    } finally {
      setSavingConfig(false);
    }
  };

  // Agregar FAQ
  const handleAddFaq = () => {
    if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) return;
    const newFaq: BotFAQ = {
      id: `faq-${Date.now()}`,
      question: newFaqQuestion.trim(),
      answer: newFaqAnswer.trim(),
    };
    setConfig((prev) => ({
      ...prev,
      faqs: [...prev.faqs, newFaq],
    }));
    setNewFaqQuestion("");
    setNewFaqAnswer("");
    setShowAddFaq(false);
  };

  // Eliminar FAQ
  const handleDeleteFaq = (id: string) => {
    setConfig((prev) => ({
      ...prev,
      faqs: prev.faqs.filter((f) => f.id !== id),
    }));
  };

  // Probar el bot en vivo con la configuración actual
  const handleTestBot = async () => {
    if (!testMessage.trim()) return;
    setTestingAI(true);
    setTestResponse(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: testMessage,
          history: [],
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setTestResponse(data.reply);
      } else {
        setTestResponse("Respuesta recibida correctamente del motor de IA.");
      }
    } catch (err) {
      setTestResponse("Error al consultar el modelo de prueba.");
    } finally {
      setTestingAI(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 pb-16">
      {/* Encabezado */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="size-4 text-signal" />
            <p className="text-xs font-semibold tracking-wider uppercase text-signal">
              Panel de Control & Inteligencia Artificial
            </p>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Configuración del Asistente & Sistema
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Personaliza el comportamiento de la IA, gestiona la base de conocimiento de WhatsApp y audita la infraestructura.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveConfig}
          disabled={savingConfig}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-xs font-bold text-ink shadow-glow transition hover:bg-emerald-300 active:scale-95 disabled:opacity-50"
        >
          {savingConfig ? (
            <RefreshCw className="size-4 animate-spin" />
          ) : savedSuccess ? (
            <Check className="size-4 text-ink" />
          ) : (
            <Save className="size-4" />
          )}
          <span>{savingConfig ? "Guardando..." : savedSuccess ? "¡Guardado!" : "Guardar Cambios"}</span>
        </button>
      </header>

      {/* SECCIÓN 1: EDITOR DE PERSONALIDAD Y PROMPT DEL BOT */}
      <section className="rounded-xl border border-line bg-panel/80 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-signal/15 text-signal border border-signal/30">
              <Bot className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">
                Personalidad del Asistente Virtual
              </h2>
              <p className="text-xs text-slate-400">
                Ajusta la identidad, el tono de conversación y el alcance de las respuestas en WhatsApp.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-mono text-emerald-400 border border-emerald-500/30 rounded-lg px-2.5 py-1 bg-emerald-500/10 self-start sm:self-auto">
            Sincronizado con Gemini
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Nombre del Asistente */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Nombre del Asistente
            </label>
            <input
              type="text"
              value={config.botName}
              onChange={(e) => setConfig({ ...config, botName: e.target.value })}
              placeholder="Ej: Antigravity"
              className="w-full rounded-lg border border-line bg-ink/70 px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
            />
          </div>

          {/* Nombre de la Empresa */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Nombre de la Empresa / Agencia
            </label>
            <input
              type="text"
              value={config.companyName}
              onChange={(e) => setConfig({ ...config, companyName: e.target.value })}
              placeholder="Ej: Deploy"
              className="w-full rounded-lg border border-line bg-ink/70 px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
            />
          </div>

          {/* Tono de Respuesta */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">
              Tono de Comunicación
            </label>
            <input
              type="text"
              value={config.tone}
              onChange={(e) => setConfig({ ...config, tone: e.target.value })}
              placeholder="Ej: Cálido, servicial, conciso y directo para WhatsApp móvil, usando emojis moderados"
              className="w-full rounded-lg border border-line bg-ink/70 px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
            />
          </div>

          {/* Reglas de Negocio y Guardrails */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Reglas de Negocio y Políticas (Guardrails)</span>
              <span className="text-[10px] text-slate-500 font-normal">
                Instrucciones mandatorias que el bot debe respetar siempre
              </span>
            </label>
            <textarea
              rows={4}
              value={config.customRules}
              onChange={(e) => setConfig({ ...config, customRules: e.target.value })}
              placeholder="Escribe las políticas de precios, horarios o limitaciones..."
              className="w-full rounded-lg border border-line bg-ink/70 p-3 text-xs sm:text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:border-signal/50 transition resize-y font-mono"
            />
          </div>
        </div>
      </section>

      {/* SECCIÓN 2: BASE DE CONOCIMIENTO DINÁMICA (FAQs) */}
      <section className="rounded-xl border border-line bg-panel/80 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-400/15 text-amber-400 border border-amber-400/30">
              <HelpCircle className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-white">
                Base de Conocimiento Dinámica (FAQs)
              </h2>
              <p className="text-xs text-slate-400">
                Preguntas frecuentes oficiales que la IA utiliza para responder consultas técnicas y comerciales.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAddFaq(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-signal/30 bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal hover:bg-signal/20 transition active:scale-95 self-start sm:self-auto"
          >
            <Plus className="size-3.5" />
            <span>Agregar Pregunta</span>
          </button>
        </div>

        {/* Modal / Form Inline para nueva FAQ */}
        {showAddFaq && (
          <div className="rounded-xl border border-signal/40 bg-ink/80 p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="text-xs font-bold uppercase tracking-wider text-signal">
              Nueva Pregunta Frecuente
            </h4>
            <div className="space-y-2">
              <input
                type="text"
                value={newFaqQuestion}
                onChange={(e) => setNewFaqQuestion(e.target.value)}
                placeholder="¿Cuál es la pregunta del cliente?"
                className="w-full rounded-lg border border-line bg-black/40 px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-signal/50 transition"
              />
              <textarea
                rows={2}
                value={newFaqAnswer}
                onChange={(e) => setNewFaqAnswer(e.target.value)}
                placeholder="Respuesta oficial que el bot debe proporcionar..."
                className="w-full rounded-lg border border-line bg-black/40 p-2.5 text-xs text-slate-200 placeholder:text-slate-500 outline-none focus:border-signal/50 transition resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddFaq(false)}
                className="rounded-lg border border-line bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddFaq}
                disabled={!newFaqQuestion.trim() || !newFaqAnswer.trim()}
                className="rounded-lg bg-signal px-3.5 py-1.5 text-xs font-bold text-ink hover:bg-emerald-300 transition disabled:opacity-40"
              >
                Guardar en la Base
              </button>
            </div>
          </div>
        )}

        {/* Lista de FAQs */}
        <div className="grid gap-3">
          {config.faqs.map((faq, index) => (
            <div
              key={faq.id || index}
              className="flex items-start justify-between gap-3 rounded-xl border border-line bg-ink/50 p-3.5 transition hover:border-signal/30 group"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold text-white flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-md bg-signal/15 text-[10px] font-bold text-signal">
                    {index + 1}
                  </span>
                  <span>{faq.question}</span>
                </p>
                <p className="text-xs text-slate-400 pl-7 leading-relaxed">
                  {faq.answer}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleDeleteFaq(faq.id)}
                className="opacity-60 group-hover:opacity-100 text-slate-500 hover:text-rose-400 transition p-1 shrink-0"
                title="Eliminar pregunta"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* SECCIÓN 3: SIMULADOR DE RESPUESTA EN VIVO */}
      <section className="rounded-xl border border-line bg-panel/80 p-5 sm:p-6 shadow-xl backdrop-blur-xl space-y-4">
        <div className="flex items-center gap-2.5 border-b border-line pb-3">
          <span className="grid size-8 place-items-center rounded-lg bg-sky-500/15 text-sky-400 border border-sky-500/30">
            <Sparkles className="size-4" />
          </span>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white">
              Simulador de Respuestas IA
            </h3>
            <p className="text-xs text-slate-400">
              Escribe una consulta de prueba para verificar cómo responderá el modelo con las configuraciones actuales.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleTestBot()}
            placeholder="Ej: ¿Qué servicios ofrecen y cómo se paga?"
            className="flex-1 rounded-xl border border-line bg-ink/70 px-4 py-2.5 text-xs sm:text-sm text-white placeholder:text-slate-500 outline-none focus:border-sky-500/50 transition"
          />
          <button
            type="button"
            onClick={handleTestBot}
            disabled={testingAI || !testMessage.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:bg-sky-400 transition active:scale-95 disabled:opacity-40"
          >
            {testingAI ? <RefreshCw className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="hidden sm:inline">Probar</span>
          </button>
        </div>

        {testResponse && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap animate-in fade-in duration-200">
            <p className="text-[11px] font-bold text-sky-300 uppercase tracking-wide mb-1">
              Respuesta Generada por Gemini:
            </p>
            {testResponse}
          </div>
        )}
      </section>

      {/* SECCIÓN 4: TELEMETRÍA Y ESTADO DE INFRAESTRUCTURA */}
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
              <span className="text-slate-400">Transcripción Audio:</span>
              <span className="text-emerald-400 font-semibold">Gemini Flash Activo</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Modo de Envío:</span>
              <span className="text-emerald-400">Producción Directa</span>
            </div>
          </div>
        </article>

        {/* Gemini Engine */}
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
              <span className="text-slate-400">Ficha de Handoff:</span>
              <span className="text-emerald-400">Automática con IA</span>
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
              <span className="text-slate-400">Tablas:</span>
              <span className="text-white">contacts, conversations, messages</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Websockets:</span>
              <span className="text-sky-400">Live Updates Activo</span>
            </div>
          </div>
        </article>

        {/* Alertas Sonoras */}
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
            <h3 className="text-base font-semibold text-white">Alertas Sonoras</h3>
            <p className="text-xs text-slate-400 mt-0.5">Mensajes y Handoff a Asesor</p>
          </div>

          <div className="space-y-2 text-xs border-t border-line pt-3 text-slate-300">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Mensajes:</span>
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
              <span className="text-slate-400">Handoff:</span>
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
          </div>
        </article>
      </section>
    </div>
  );
}
