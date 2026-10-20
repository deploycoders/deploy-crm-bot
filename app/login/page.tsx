"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { SUPERADMIN_USER, saveSession } from "@/lib/auth";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
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

  const handleQuickAccess = () => {
    saveSession(SUPERADMIN_USER);
    window.location.href = "/";
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden bg-background selection:bg-primary/30 selection:text-primary">
      {/* Luces de fondo y efectos ambientales */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-primary/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-secondary/10 rounded-full blur-[120px] pointer-events-none" />

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
          <div className="inline-flex items-center justify-center size-14 rounded-2xl border border-primary/40 bg-primary/10 shadow-glow mb-3">
            <span className="material-symbols-outlined text-primary text-[32px] animate-pulse">
              smart_toy
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight">
            SalesBot CRM <span className="text-primary">Deploy</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-on-surface-variant">
            Control Operativo de WhatsApp & IA • Autenticación Oficial en Supabase
          </p>
        </div>

        {/* Tarjeta Principal de Login */}
        <div className="rounded-2xl border border-surface-container-high bg-surface-container-low/95 p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
          {/* Header de la tarjeta */}
          <div className="flex items-center justify-between pb-4 mb-5 border-b border-surface-container-high/60">
            <div className="flex items-center gap-2">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/15 text-primary border border-primary/30">
                <span className="material-symbols-outlined text-[16px]">verified_user</span>
              </span>
              <div>
                <p className="text-xs font-bold text-on-surface uppercase tracking-wider">
                  Acceso Restringido
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                  <span className="material-symbols-outlined text-[13px] text-secondary">
                    dns
                  </span>
                  <span>Validación estricta en Supabase Auth</span>
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/30 bg-secondary/10 px-2.5 py-1 text-[11px] font-semibold text-secondary">
              <span className="size-1.5 rounded-full bg-secondary animate-pulse" />
              Supabase Auth
            </span>
          </div>

          {/* Mensaje de error */}
          {error && (
            <div className="mb-4 rounded-xl border border-error/30 bg-error-container/30 p-3 text-xs text-error flex items-start gap-2">
              <span className="font-bold">✕</span>
              <span>{error}</span>
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-medium text-on-surface-variant mb-1.5"
              >
                Correo Electrónico
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-outline">
                  mail
                </span>
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@dominio.com"
                  required
                  autoComplete="email"
                  className="w-full rounded-xl border border-surface-container-high bg-surface-container pl-10 pr-4 py-2.5 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password-input"
                className="block text-xs font-medium text-on-surface-variant mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-outline">
                  lock
                </span>
                <input
                  id="password-input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-surface-container-high bg-surface-container pl-10 pr-10 py-2.5 text-sm text-on-surface placeholder:text-outline focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? "visibility_off" : "visibility"}
                  </span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              id="submit-login-btn"
              disabled={loading}
              className="w-full group rounded-xl bg-primary hover:bg-secondary px-4 py-3 text-sm font-semibold text-on-primary shadow-glow transition disabled:opacity-50 mt-2 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{loading ? "Verificando en Supabase..." : "Iniciar Sesión"}</span>
              <span className="material-symbols-outlined text-[16px] transition group-hover:translate-x-1">
                arrow_forward
              </span>
            </button>

            {/* Acceso Rápido / Demo Administrador */}
            <button
              type="button"
              onClick={handleQuickAccess}
              className="w-full rounded-xl border border-surface-container-high hover:border-primary/40 bg-surface-container/60 hover:bg-surface-container px-4 py-2.5 text-xs font-semibold text-on-surface transition flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-secondary text-[16px]">
                bolt
              </span>
              <span>Entrar directo como Super Administrador</span>
            </button>
          </form>

          {/* Información de seguridad */}
          <div className="mt-5 pt-4 border-t border-surface-container-high/50 text-center text-xs text-outline">
            <p>Solo usuarios autorizados con cuenta activa en Supabase Auth pueden acceder al CRM.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-outline">
          <span>🔒 Supabase Auth</span>
          <span>•</span>
          <span>Acceso Protegido</span>
          <span>•</span>
          <span>Deploy AI Cockpit</span>
        </div>
      </div>
    </div>
  );
}
