export interface ExportableLead {
  id: string;
  name?: string | null;
  phone: string;
  status: string;
  lastMessage?: string | null;
  lastMessageAt?: string;
  createdAt?: string;
  notes?: string;
  tags?: string[];
}

/**
 * Exporta una lista de leads a un archivo CSV compatible con Microsoft Excel (con BOM UTF-8)
 */
export function exportLeadsToCSV(leads: ExportableLead[], filename = "Leads_SalesBot_CRM.csv") {
  if (!leads || leads.length === 0) {
    alert("No hay leads para exportar.");
    return;
  }

  const headers = [
    "ID",
    "Nombre del Lead",
    "Teléfono",
    "Estado en CRM",
    "Último Mensaje",
    "Fecha Último Contacto",
    "Fecha Creación",
    "Etiquetas",
    "Notas del Asesor",
  ];

  const escapeCSV = (val?: string | null) => {
    if (val === null || val === undefined) return '""';
    const clean = String(val).replace(/"/g, '""').replace(/\n/g, " ");
    return `"${clean}"`;
  };

  const rows = leads.map((l) => [
    escapeCSV(l.id),
    escapeCSV(l.name || "Sin Nombre"),
    escapeCSV(l.phone),
    escapeCSV(l.status),
    escapeCSV(l.lastMessage || "-"),
    escapeCSV(l.lastMessageAt ? new Date(l.lastMessageAt).toLocaleString("es-ES") : "-"),
    escapeCSV(l.createdAt ? new Date(l.createdAt).toLocaleString("es-ES") : "-"),
    escapeCSV((l.tags || []).join(", ") || "Ninguna"),
    escapeCSV(l.notes || "-"),
  ]);

  const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  // \uFEFF es el BOM (Byte Order Mark) UTF-8 para que Excel lo abra con tildes y caracteres en español perfectos
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
