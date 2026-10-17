"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  UsersRound,
  BellRing,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Mensajes", icon: MessageSquareText },
  { href: "/contactos", label: "Contactos", icon: UsersRound },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [handoffCount, setHandoffCount] = useState<number>(0);

  // Obtener conteo real de conversaciones que requieren asesor humano
  const fetchHandoffCount = async () => {
    try {
      const { count, error } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("status", "waiting_agent");

      if (!error && count !== null) {
        setHandoffCount(count);
      }
    } catch (e) {
      console.error("Error al cargar cola de handoff:", e);
    }
  };

  useEffect(() => {
    fetchHandoffCount();

    // Suscribirse a cambios en vivo en la tabla de conversaciones
    const channel = supabase
      .channel("sidebar-handoff-counter")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        () => {
          fetchHandoffCount();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <aside className="sticky top-0 z-20 border-b border-line bg-ink/95 px-3 py-2.5 sm:px-4 sm:py-4 backdrop-blur-xl lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6 lg:flex lg:flex-col lg:justify-between">
      <div>
        <div className="flex items-center justify-between gap-4 lg:block">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="grid size-9 sm:size-11 place-items-center rounded-lg border border-signal/35 bg-signal/10 shadow-glow transition group-hover:scale-105">
              <Bot className="size-4 sm:size-5 text-signal" />
            </span>
            <div>
              <span className="block text-sm sm:text-base font-semibold text-white tracking-tight">
                SalesBot CRM
              </span>
              <span className="text-[11px] sm:text-xs text-slate-400">
                Deploy AI Cockpit
              </span>
            </div>
          </Link>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-signal/25 bg-signal/10 px-2.5 py-0.5 sm:px-3 sm:py-1 text-[11px] sm:text-xs font-medium text-signal lg:mt-6">
            <span className="size-1.5 rounded-full bg-signal animate-pulse" />
            Live System
          </div>
        </div>

        <nav className="mt-3 sm:mt-5 flex gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 lg:mt-8 lg:block lg:space-y-2 lg:overflow-visible">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);

            const isChatWithHandoff = item.href === "/chat" && handoffCount > 0;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`group flex min-w-max items-center gap-2.5 sm:gap-3 rounded-lg border px-2.5 sm:px-3 py-1.5 sm:py-2.5 text-xs sm:text-sm font-medium transition ${
                  isActive
                    ? "border-signal/30 bg-signal/10 text-white shadow-glow"
                    : "border-transparent text-slate-300 hover:border-line hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon
                  className={`size-3.5 sm:size-4 transition ${
                    isActive ? "text-signal" : "text-slate-400 group-hover:text-signal"
                  }`}
                />
                <span>{item.label}</span>
                {isChatWithHandoff && (
                  <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[10px] sm:text-[11px] font-bold text-amber-300 border border-amber-400/30 animate-pulse">
                    {handoffCount}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Widget de Handoff Queue con DATA REAL de Supabase */}
      <div className="mt-8 hidden rounded-xl border border-line bg-panel/80 p-4 lg:block shadow-lg">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
            Handoff Queue
          </p>
          <BellRing
            className={`size-4 ${
              handoffCount > 0 ? "text-amber-400 animate-bounce" : "text-slate-500"
            }`}
          />
        </div>
        <p className="mt-3 text-3xl font-bold tracking-tight text-white">
          {handoffCount}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          {handoffCount === 1
            ? "1 lead esperando asesor humano."
            : `${handoffCount} leads esperando asesor humano.`}
        </p>
        {handoffCount > 0 && (
          <Link
            href="/chat"
            className="mt-3 block text-center rounded-lg bg-amber-500/10 border border-amber-500/20 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition"
          >
            Atender ahora →
          </Link>
        )}
      </div>
    </aside>
  );
}
