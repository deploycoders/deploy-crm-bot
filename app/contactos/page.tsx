"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  MessageSquare,
  Phone,
  Search,
  UserCheck,
  UsersRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface ContactItem {
  id: string;
  name: string | null;
  phone: string;
  created_at: string;
  conversation?: {
    id: string;
    status: string;
    last_message_preview: string | null;
    last_message_at: string;
  } | null;
}

export default function ContactosPage() {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchContacts = async () => {
    try {
      // 1. Obtener contactos
      const { data: contactsData, error: contactsError } = await supabase
        .from("contacts")
        .select("*")
        .order("created_at", { ascending: false });

      if (contactsError) throw contactsError;

      // 2. Obtener conversaciones asociadas
      const { data: convData } = await supabase
        .from("conversations")
        .select("id, contact_id, status, last_message_preview, last_message_at");

      const convMap = new Map();
      convData?.forEach((c) => {
        convMap.set(c.contact_id, c);
      });

      const fullContacts: ContactItem[] = (contactsData || []).map((contact) => ({
        ...contact,
        conversation: convMap.get(contact.id) || null,
      }));

      setContacts(fullContacts);
    } catch (err) {
      console.error("Error al cargar contactos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, []);

  const filteredContacts = contacts.filter((c) => {
    const term = searchTerm.toLowerCase();
    const nameMatch = c.name?.toLowerCase().includes(term);
    const phoneMatch = c.phone.toLowerCase().includes(term);
    return nameMatch || phoneMatch;
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2">
            <UsersRound className="size-4 text-signal" />
            <p className="text-xs font-semibold tracking-wider uppercase text-signal">
              Base de Datos de Leads
            </p>
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
            Directorio de Contactos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Clientes y prospectos que han interactuado con el bot de WhatsApp.
          </p>
        </div>

        {/* Buscador */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-line bg-panel/80 pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-signal/50 focus:outline-none"
          />
        </div>
      </header>

      {/* Grid de Contactos */}
      <div className="overflow-hidden rounded-xl border border-line bg-panel/70 shadow-2xl backdrop-blur-xl">
        <div className="border-b border-line px-5 py-4 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            {filteredContacts.length} {filteredContacts.length === 1 ? "contacto encontrado" : "contactos encontrados"}
          </p>
          <span className="text-xs text-slate-400">
            Sincronizado con Supabase
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[0.02] text-xs uppercase tracking-wider text-slate-400 border-b border-line">
              <tr>
                <th className="px-5 py-3 font-medium">Contacto</th>
                <th className="px-5 py-3 font-medium">Teléfono WhatsApp</th>
                <th className="px-5 py-3 font-medium">Fecha de Registro</th>
                <th className="px-5 py-3 font-medium">Última Actividad</th>
                <th className="px-5 py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                    {loading ? "Cargando contactos..." : "No se encontraron contactos."}
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const name = contact.name || "Cliente WhatsApp";
                  const convId = contact.conversation?.id;

                  return (
                    <tr key={contact.id} className="hover:bg-white/[0.03] transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid size-9 place-items-center rounded-lg bg-signal/10 border border-signal/20 text-xs font-bold text-signal uppercase">
                            {name.substring(0, 2)}
                          </span>
                          <div>
                            <p className="font-medium text-white">{name}</p>
                            <span className="text-xs text-slate-400">Lead verificado</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-300">
                          <Phone className="size-3 text-signal" />
                          {contact.phone}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(contact.created_at)}
                      </td>
                      <td className="px-5 py-4 max-w-xs">
                        <p className="truncate text-xs text-slate-300">
                          {contact.conversation?.last_message_preview || "Sin actividad reciente"}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        {convId ? (
                          <Link
                            href={`/chat?id=${convId}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-signal/40 hover:bg-signal/10 hover:text-signal"
                          >
                            <MessageSquare className="size-3.5" />
                            Abrir Chat
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-500">Sin conversación</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
