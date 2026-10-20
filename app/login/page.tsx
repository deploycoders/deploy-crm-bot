"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  Bot,
  Lock,
  Mail,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  Database,
  ArrowRight,
} from "lucide-react";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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

      <div className="relative w-full max-w-md">
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
          {/* Header de la tarjeta */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-line">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-signal/15 text-signal border border-signal/30">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">
                  Acceso Restringido
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                  <Database className="size-3 text-sky-400" />
                  <span>Validación estricta en Supabase Auth</span>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-300">
              <span className="size-1.5 rounded-full bg-sky-400 animate-pulse" />
              Supabase Auth
            </span>
          </div>

          {/* Mensaje de error si las credenciales son incorrectas */}
          {error && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-start gap-2">
              <span className="text-red-400 font-bold">✕</span>
              <span>{error}</span>
            </div>
          )}

          {/* Formulario de Login Estricto */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Correo Electrónico
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@dominio.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-line bg-ink/70 pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-signal/70 focus:outline-none focus:ring-1 focus:ring-signal/50 transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-medium text-slate-300 mb-1.5"
              >
                Contraseña
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
                  autoComplete="current-password"
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
              className="w-full group rounded-xl border border-signal/50 bg-signal/15 hover:bg-signal/25 px-4 py-3 text-sm font-semibold text-white shadow-glow transition disabled:opacity-50 mt-2 flex items-center justify-center gap-2"
            >
              <span>{loading ? "Verificando en Supabase..." : "Iniciar Sesión"}</span>
              <ArrowRight className="size-4 text-signal transition group-hover:translate-x-1" />
            </button>
          </form>

          {/* Información de seguridad */}
          <div className="mt-5 pt-4 border-t border-line text-center text-xs text-slate-400">
            <p>Solo usuarios autorizados con cuenta activa en Supabase Auth pueden acceder al CRM.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-500">
          <span>🔒 Supabase Auth (Bcrypt)</span>
          <span>•</span>
          <span>Acceso Protegido</span>
          <span>•</span>
          <span>Deploy AI Cockpit</span>
        </div>
      </div>
    </div>
  );
}
