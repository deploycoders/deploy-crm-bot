import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
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
        <div className="min-h-screen lg:flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-2 py-2 sm:px-6 sm:py-5 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
