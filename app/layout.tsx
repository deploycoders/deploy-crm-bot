import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import { GlobalNotifications } from "@/components/GlobalNotifications";
import "./globals.css";

export const metadata: Metadata = {
  title: "SalesBot CRM - Deploy",
  description: "CRM para gestión de chatbot de ventas, soporte y handoff humano.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="bg-ink text-slate-100 antialiased selection:bg-signal/20 selection:text-signal">
        <GlobalNotifications />
        <div className="min-h-screen lg:h-screen lg:overflow-hidden lg:flex">
          <Sidebar />
          <main className="min-w-0 flex-1 h-full overflow-y-auto px-2 py-2 sm:px-4 sm:py-3 lg:px-6 lg:py-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
