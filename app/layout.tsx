import type { Metadata } from "next";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  LayoutDashboard,
  MessageSquareText,
  Settings,
  UsersRound,
} from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SalesBot CRM",
  description: "CRM para gestion de chatbot de ventas y handoff humano.",
};

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Mensajes", icon: MessageSquareText },
  { href: "#contactos", label: "Contactos", icon: UsersRound },
  { href: "#analiticas", label: "Analiticas", icon: BarChart3 },
  { href: "#configuracion", label: "Configuracion", icon: Settings },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <div className="min-h-screen lg:flex">
          <aside className="sticky top-0 z-20 border-b border-line bg-ink/88 px-4 py-4 backdrop-blur-xl lg:h-screen lg:w-72 lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
            <div className="flex items-center justify-between gap-4 lg:block">
              <Link href="/" className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-lg border border-signal/35 bg-signal/10 shadow-glow">
                  <Bot className="size-5 text-signal" />
                </span>
                <span>
                  <span className="block text-base font-semibold text-white">
                    SalesBot CRM
                  </span>
                  <span className="text-xs text-slate-400">
                    AI handoff cockpit
                  </span>
                </span>
              </Link>
              <div className="rounded-full border border-signal/25 bg-signal/10 px-3 py-1 text-xs font-medium text-signal lg:mt-6 lg:inline-block">
                Live
              </div>
            </div>

            <nav className="mt-5 flex gap-2 overflow-x-auto pb-1 lg:mt-8 lg:block lg:space-y-2 lg:overflow-visible">
              {navigation.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex min-w-max items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:border-line hover:bg-white/6 hover:text-white"
                >
                  <item.icon className="size-4 text-slate-500 transition group-hover:text-signal" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-8 hidden rounded-lg border border-line bg-white/[0.04] p-4 lg:block">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Handoff Queue
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">12</p>
              <p className="mt-1 text-sm text-slate-400">
                leads esperan asesor humano.
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
