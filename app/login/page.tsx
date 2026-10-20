"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Bot,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Eye,
  EyeOff,
  Zap,
  CheckCircle2,
  Database,
} from "lucide-react";

export default function LoginPage() {
  const { login, loginAsSuperadmin } = useAuth();
  const [email, setEmail] = useState("admin@salesbot.crm");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await login(email, password);
      if (!result.success && result.error) {
        setError(result.error);
        setLoading(false);
      }
    } catch {
      setError("Ocurrió un error inesperado al conectar con Supabase Auth.");
      setLoading(false);
    }
  };

  const handleQuickSuperadmin = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await loginAsSuperadmin();
      if (!res.success && res.error) {
        setError(res.error);
        setLoading(false);
      }
    } catch {
      setError("Error al iniciar sesión con Supabase Auth.");
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-ink selection:bg-signal/30 selection:text-signal">
      {/* Luces de fondo y efectos ambientales */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-signal/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-sky-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Grid sutil de fondo */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative w-full max-w-xl">
        {/* Cabecera / Marca */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl border border-signal/40 bg-signal/10 shadow-glow mb-3">
            <Bot className="size-8 text-signal animate-pulse" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            SalesBot CRM <span className="text-signal">Deploy</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Control Operativo de WhatsApp & IA • Autenticación Oficial en Supabase
          </p>
        </div>

        {/* Tarjeta Principal de Login */}
        <div className="rounded-2xl border border-line bg-panel/85 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Badge superior de privilegios y Supabase */}
          <div className="flex items-center justify-between pb-5 mb-5 border-b border-line">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-signal/15 text-signal border border-signal/30">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">
                  Acceso Super Administrador
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Database className="size-3 text-sky-400" />
                  <span>Almacenado y validado en Supabase Auth</span>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
              <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
              Supabase Auth
            </span>
          </div>

          {/* Botón de Acceso Instantáneo Superadmin en Supabase */}
          <div className="mb-6">
            <button
              type="button"
              id="quick-superadmin-login-btn"
              onClick={handleQuickSuperadmin}
              disabled={loading}
              className="w-full group relative overflow-hidden rounded-xl border border-signal/60 bg-gradient-to-r from-signal/20 via-signal/30 to-emerald-400/20 px-4 py-3 text-sm font-bold text-white shadow-glow transition duration-200 hover:border-signal hover:shadow-[0_0_40px_rgba(55,242,154,0.3)] disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                <Zap className="size-4 text-signal fill-signal transition group-hover:scale-110" />
                <span>
                  {loading ? "Validando en Supabase..." : "⚡ Entrar Directo con Todos los Permisos"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 font-normal mt-0.5">
                Valida usuario y contraseña en Supabase Auth • Permisos Totales
              </p>
            </button>
          </div>

          {/* Divisor */}
          <div className="relative my-5 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-line" />
            </div>
            <span className="relative bg-panel px-3 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              o ingresa tus credenciales de Supabase
            </span>
          </div>

          {/* Mensaje de error si existiera */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Formulario de Login */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Correo Electrónico (Registrado en Supabase)
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@salesbot.crm"
                  required
                  className="w-full rounded-xl border border-line bg-ink/70 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-signal/70 focus:outline-none focus:ring-1 focus:ring-signal/50 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Contraseña en Supabase
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-line bg-ink/70 pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-signal/70 focus:outline-none focus:ring-1 focus:ring-signal/50 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="submit-login-btn"
              disabled={loading}
              className="w-full rounded-xl border border-line bg-white/10 hover:bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-50 mt-2"
            >
              {loading ? "Verificando en Supabase..." : "Iniciar Sesión en Supabase"}
            </button>
          </form>

          {/* Grilla de Permisos Concedidos */}
          <div className="mt-6 pt-5 border-t border-line">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-signal" />
              Matriz de Permisos Activos del Usuario:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-1.5 bg-ink/40 p-2 rounded-lg border border-line">
                <CheckCircle2 className="size-3.5 text-signal shrink-0" />
                <span>Gestor de Chats & Handoff</span>
              </div>
              <div className="flex items-center gap-1.5 bg-ink/40 p-2 rounded-lg border border-line">
                <CheckCircle2 className="size-3.5 text-signal shrink-0" />
                <span>Meta WhatsApp Cloud API</span>
              </div>
              <div className="flex items-center gap-1.5 bg-ink/40 p-2 rounded-lg border border-line">
                <CheckCircle2 className="size-3.5 text-signal shrink-0" />
                <span>Agente IA Gemini 2.5</span>
              </div>
              <div className="flex items-center gap-1.5 bg-ink/40 p-2 rounded-lg border border-line">
                <CheckCircle2 className="size-3.5 text-signal shrink-0" />
                <span>Supabase DB & Contactos</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer con info de seguridad */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <span>🔒 Supabase Auth (Bcrypt)</span>
          <span>•</span>
          <span>Sesión Segura</span>
          <span>•</span>
          <span>Deploy AI Cockpit</span>
        </div>
      </div>
    </div>
  );
}
