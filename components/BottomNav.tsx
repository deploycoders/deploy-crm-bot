"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function BottomNav() {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState<number>(12); // fallback matching reference mockup

  useEffect(() => {
    // Obtener unread_count real desde Supabase si está disponible
    const fetchUnread = async () => {
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("unread_count")
          .gt("unread_count", 0);

        if (!error && data && data.length > 0) {
          const total = data.reduce((acc, c) => acc + (c.unread_count || 0), 0);
          setUnreadCount(total > 0 ? total : 12);
        }
      } catch {
        // mantener fallback de 12
      }
    };

    fetchUnread();
  }, []);

  const navItems = [
    {
      href: "/",
      label: "Panel",
      icon: "grid_view",
      isActive: pathname === "/",
    },
    {
      href: "/chat",
      label: "Mensajes",
      icon: "chat",
      badge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount.toString()) : undefined,
      isActive: pathname.startsWith("/chat"),
    },
    {
      href: "/contactos",
      label: "Contactos",
      icon: "contact_phone",
      isActive: pathname.startsWith("/contactos"),
    },
    {
      href: "/pipeline",
      label: "Flujos",
      icon: "account_tree",
      isActive: pathname.startsWith("/pipeline"),
    },
    {
      href: "/configuracion",
      label: "Ajustes",
      icon: "settings",
      isActive: pathname.startsWith("/configuracion"),
    },
  ];

  return (
    <nav
      aria-label="Navegación móvil"
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-[#051424]/95 backdrop-blur-xl border-t border-[#1c2b3c]/80 shadow-[0_-4px_20px_rgba(0,0,0,0.5)] px-2 py-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const active = item.isActive;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all select-none ${
                active
                  ? "text-primary"
                  : "text-slate-400 hover:text-slate-200 active:scale-95"
              }`}
            >
              {/* Contenedor del Icono con Badge */}
              <div className="relative flex items-center justify-center">
                <span
                  className={`material-symbols-outlined text-[22px] transition-transform ${
                    active ? "scale-110" : ""
                  }`}
                >
                  {item.icon}
                </span>

                {item.badge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-primary text-[#003824] text-[10px] font-black flex items-center justify-center shadow-sm">
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Etiqueta */}
              <span
                className={`text-[10px] mt-0.5 tracking-tight font-medium ${
                  active ? "font-bold text-primary" : "text-slate-400"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
