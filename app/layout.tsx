import type { Metadata } from "next";
import { AuthProvider } from "@/context/AuthContext";
import { AuthShell } from "@/components/AuthShell";
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
        <AuthProvider>
          <AuthShell>{children}</AuthShell>
        </AuthProvider>
      </body>
    </html>
  );
}
