"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { tenantRequestHeaders } from "@/lib/tenantClient";
import {
  Package,
  Plus,
  Search,
  Tag,
  Boxes,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Trash2,
  Edit2,
  RefreshCw,
  DollarSign,
  Layers,
  ArrowUpDown,
} from "lucide-react";

interface CatalogItem {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category: string;
  price: number;
  compare_price: number | null;
  currency: string;
  stock_qty: number;
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export default function CatalogoPage() {
  const { activeTenant } = useAuth();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Form State
  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General");
  const [price, setPrice] = useState("0");
  const [comparePrice, setComparePrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [stockQty, setStockQty] = useState("10");

  const fetchCatalog = async () => {
    if (!activeTenant?.id) return;
    setLoading(true);
    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/catalog?limit=100", { headers });
      const data = await res.json();
      if (res.ok && data.items) {
        setItems(data.items);
      }
    } catch (err) {
      console.error("Error al cargar catálogo:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [activeTenant?.id]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return ["all", ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesCat =
        selectedCategory === "all" ||
        item.category.toLowerCase() === selectedCategory.toLowerCase();
      const q = search.toLowerCase().trim();
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.sku && item.sku.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        item.category.toLowerCase().includes(q);

      return matchesCat && matchesSearch;
    });
  }, [items, selectedCategory, search]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setSku("");
    setName("");
    setDescription("");
    setCategory("General");
    setPrice("0");
    setComparePrice("");
    setCurrency("USD");
    setStockQty("10");
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleOpenEdit = (item: CatalogItem) => {
    setEditingItem(item);
    setSku(item.sku || "");
    setName(item.name);
    setDescription(item.description || "");
    setCategory(item.category || "General");
    setPrice(item.price.toString());
    setComparePrice(item.compare_price ? item.compare_price.toString() : "");
    setCurrency(item.currency || "USD");
    setStockQty(item.stock_qty.toString());
    setErrorMsg(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setErrorMsg(null);

    const payload = {
      id: editingItem?.id,
      sku: sku.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      category: category.trim() || "General",
      price: parseFloat(price) || 0,
      compare_price: comparePrice ? parseFloat(comparePrice) : null,
      currency: currency.trim() || "USD",
      stock_qty: parseInt(stockQty, 10) || 0,
    };

    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/catalog", {
        method: editingItem ? "PUT" : "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo guardar el producto");
      } else {
        setShowModal(false);
        await fetchCatalog();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Error al conectar con el servidor");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, itemName: string) => {
    if (!confirm(`¿Eliminar "${itemName}" del catálogo oficial? El bot ya no ofrecerá este producto.`)) {
      return;
    }

    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch(`/api/catalog?id=${id}`, {
        method: "DELETE",
        headers,
      });

      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }
    } catch (err) {
      console.error("Error al eliminar producto:", err);
    }
  };

  const handleQuickStock = async (item: CatalogItem, delta: number) => {
    const newQty = Math.max(0, item.stock_qty + delta);
    try {
      const headers = await tenantRequestHeaders();
      const res = await fetch("/api/catalog", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          id: item.id,
          stock_qty: newQty,
        }),
      });

      if (res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  stock_qty: newQty,
                  stock_status:
                    newQty <= 0 ? "out_of_stock" : newQty <= 5 ? "low_stock" : "in_stock",
                }
              : i
          )
        );
      }
    } catch (err) {
      console.error("Error actualizando stock rápido:", err);
    }
  };

  return (
    <div className="min-h-screen bg-[#030914] text-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-surface-container-high/40 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-primary/15 text-primary border border-primary/30">
                <Package className="w-5 h-5" />
              </span>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                Catálogo de Productos y Servicios
              </h1>
            </div>
            <p className="text-xs md:text-sm text-slate-400 mt-1">
              La verdad estricta de inventario para {activeTenant?.name || "tu organización"}.
              El bot responderá precios y existencias basadas exclusivamente en esta lista.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCatalog}
              disabled={loading}
              className="p-2.5 rounded-xl border border-surface-container-high bg-surface-container-low hover:bg-surface-container text-slate-300 transition"
              title="Recargar catálogo"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-[#003824] hover:bg-emerald-300 font-bold text-xs transition shadow-lg shadow-primary/20"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Producto</span>
            </button>
          </div>
        </div>

        {/* Resumen Métricas Rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-[#081524] border border-surface-container-high/60 flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Boxes className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Total Productos</p>
              <p className="text-lg font-bold text-white">{items.length}</p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#081524] border border-surface-container-high/60 flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">En Stock</p>
              <p className="text-lg font-bold text-emerald-300">
                {items.filter((i) => i.stock_status === "in_stock").length}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#081524] border border-surface-container-high/60 flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertCircle className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Bajo Stock</p>
              <p className="text-lg font-bold text-amber-300">
                {items.filter((i) => i.stock_status === "low_stock").length}
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#081524] border border-surface-container-high/60 flex items-center gap-3">
            <span className="p-2.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <XCircle className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[11px] text-slate-400 font-medium">Agotados</p>
              <p className="text-lg font-bold text-rose-300">
                {items.filter((i) => i.stock_status === "out_of_stock").length}
              </p>
            </div>
          </div>
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, SKU o categoría..."
              className="w-full bg-[#081524] border border-surface-container-high/70 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary transition"
            />
          </div>

          {/* Categorías */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? "bg-primary text-[#003824] shadow-sm"
                    : "bg-[#081524] border border-surface-container-high/60 text-slate-400 hover:text-white"
                }`}
              >
                {cat === "all" ? "Todos" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Productos */}
        {loading ? (
          <div className="py-20 text-center text-slate-500 text-xs">
            Cargando catálogo oficial...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-20 text-center rounded-2xl border border-dashed border-surface-container-high/60 bg-[#081524]/50">
            <Package className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p className="text-sm font-semibold text-slate-300">No se encontraron productos</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Agrega productos con precios y stock para que la IA los cotice y venda por WhatsApp con total precisión.
            </p>
            <button
              onClick={handleOpenCreate}
              className="mt-4 px-4 py-2 rounded-xl bg-primary/20 text-primary border border-primary/30 text-xs font-bold hover:bg-primary/30 transition"
            >
              + Agregar primer producto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => {
              const isOutOfStock = item.stock_status === "out_of_stock" || item.stock_qty <= 0;
              const isLowStock = item.stock_status === "low_stock";

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-surface-container-high/70 bg-[#081524] p-4 flex flex-col justify-between hover:border-primary/40 transition group"
                >
                  <div>
                    {/* Header Card */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.sku && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-container-high/80 text-primary font-bold border border-primary/20">
                            SKU: {item.sku}
                          </span>
                        )}
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {item.category}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="p-1 rounded text-slate-400 hover:text-primary transition"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="p-1 rounded text-slate-400 hover:text-rose-400 transition"
                          title="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Nombre y Descripción */}
                    <h3 className="text-sm font-bold text-white group-hover:text-primary transition line-clamp-1">
                      {item.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-[32px]">
                      {item.description || "Sin descripción detallada."}
                    </p>
                  </div>

                  {/* Precios y Stock */}
                  <div className="mt-4 pt-3 border-t border-surface-container-high/40 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-extrabold text-white">
                          {item.currency} {item.price.toFixed(2)}
                        </span>
                        {item.compare_price && item.compare_price > item.price && (
                          <span className="text-[11px] line-through text-slate-500">
                            {item.currency} {item.compare_price.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          isOutOfStock
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                            : isLowStock
                            ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        }`}
                      >
                        {item.stock_qty} disp.
                      </span>

                      {/* Control rápido de stock */}
                      <div className="flex items-center bg-black/40 rounded-lg border border-surface-container-high/50 p-0.5">
                        <button
                          onClick={() => handleQuickStock(item, -1)}
                          disabled={item.stock_qty <= 0}
                          className="px-1 text-slate-400 hover:text-white disabled:opacity-30 text-xs"
                          title="Restar 1"
                        >
                          -
                        </button>
                        <button
                          onClick={() => handleQuickStock(item, 1)}
                          className="px-1 text-slate-400 hover:text-white text-xs"
                          title="Sumar 1"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear / Editar Producto */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl border border-surface-container-high bg-[#081524] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-4 border-b border-surface-container-high/40">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-primary/15 text-primary border border-primary/30">
                  <Package className="w-5 h-5" />
                </span>
                <h3 className="text-base font-bold text-white">
                  {editingItem ? "Editar Producto" : "Nuevo Producto en Catálogo"}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Código SKU / Modelo
                  </label>
                  <input
                    type="text"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Ej. TAL-500W"
                    className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ej. Herramientas Eléctricas"
                    required
                    className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nombre del Producto / Servicio *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Taladro Percutor 1/2 Pulgada 650W"
                  required
                  className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Descripción / Especificaciones
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Incluye detalles clave, voltaje, garantía o medidas para que el bot las informe..."
                  rows={3}
                  className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500 outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Precio *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                    className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Precio Anterior
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={comparePrice}
                    onChange={(e) => setComparePrice(e.target.value)}
                    placeholder="Opcional"
                    className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Moneda
                  </label>
                  <input
                    type="text"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    placeholder="USD"
                    required
                    className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Cantidad en Stock
                </label>
                <input
                  type="number"
                  min="0"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  required
                  className="w-full bg-[#030914] border border-surface-container-high/80 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-primary"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Si se coloca 0, el bot responderá que el producto está agotado y no tomará apartados.
                </span>
              </div>

              {errorMsg && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl p-2.5">
                  {errorMsg}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-surface-container-high/40">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-primary text-[#003824] hover:bg-emerald-300 transition disabled:opacity-40"
                >
                  {saving ? "Guardando..." : editingItem ? "Actualizar Producto" : "Guardar Producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
