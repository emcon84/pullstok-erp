import { useState, useEffect, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader } from "@/components/atoms/loader";
import { toast } from "react-toastify";
import {
  listPriceKgTypes,
  type PriceKgType,
  type PriceKgSpecies,
} from "@/services/priceKgTypes";
import {
  listPriceKgBrands,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import { getPriceKgPlan } from "@/services/priceKgPlan";
import type { CellProduct } from "@/services/priceKgReview";
import type { DataItem } from "@/types";
import type { SaleMode } from "@/components/hooks/useVendorCart";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useCreateSale } from "@/components/hooks/useSales";
import { resolveDashboardBranchMode } from "@/constants/rolePermissions";
import {
  PriceKgProductPanel,
  buildCellSaleItem,
  type CellContext,
} from "@/components/molecules/PriceKgProductPanel";

// Mismo helper que PriceKgUpdate (copiado local, no está exportado). Los
// precios sueltos SIEMPRE son redondos (decisión del usuario): sin decimales.
const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

// Key de la matriz de celdas: misma convención que PriceKgUpdate — especie
// primero porque una marca/tipo AMBOS tiene una celda distinta por planilla.
const cellKey = (species: PriceKgSpecies, brandId: string, typeId: string) =>
  `${species}:${brandId}:${typeId}`;

// Precio NUMÉRICO de una celda (o undefined si no existe): la fuente
// autoritativa del precio suelto (sdd/precios-suelto-planilla C-05).
const rawCellPrice = (
  cells: Record<string, string>,
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
): number | undefined => {
  const raw = cells[cellKey(species, brandId, typeId)];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return n;
};

const speciesLabel = (s: PriceKgSpecies) =>
  s === "PERRO" ? "Perro" : s === "GATO" ? "Gato" : "Perros y gatos";

/**
 * Consulta de precios por kilo (pantalla de mostrador): lectura + venta suelta.
 * El buscador filtra marcas y, por tarjeta, muestra los precios por tipo con
 * AMBAS especies juntas cuando aplican. Las celdas CON precio son clickeables
 * y abren el panel de venta suelta (Sheet) que lista los productos que
 * matchean esa celda y permite vender directo o sumar al pedido con el precio
 * de la CELDA (no el priceKgSuelto del producto).
 */
export const PriceKgLookup = () => {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [brands, setBrands] = useState<PriceKgBrand[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [panelCell, setPanelCell] = useState<CellContext | null>(null);

  const cart = useVendorCart();
  const { createSale } = useCreateSale();

  // Sucursal del vendedor: misma resolución que Dashboard (localStorage "user"
  // + resolveDashboardBranchMode). ADMIN/MANAGEMENT → org-wide (sin sucursal).
  const branchMode = useMemo(() => {
    const raw = localStorage.getItem("user");
    let role: string | undefined;
    let branchIds: string[] | undefined;
    if (raw) {
      try {
        const u = JSON.parse(raw);
        role = u?.role;
        branchIds = u?.branchIds;
      } catch {
        /* user corrupto → org-wide */
      }
    }
    return resolveDashboardBranchMode(role, branchIds);
  }, []);
  const branchId = branchMode.kind === "single" ? branchMode.branchId : undefined;

  // Carga inicial paralela de tipos, marcas y planilla. Cualquier error se
  // degrada a listas vacías (la pantalla sigue funcionando con datos parciales).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesData, brandsData, plan] = await Promise.all([
          listPriceKgTypes(),
          listPriceKgBrands(),
          getPriceKgPlan(),
        ]);
        if (cancelled) return;
        setTypes(typesData);
        setBrands(brandsData);
        const map: Record<string, string> = {};
        for (const c of plan) {
          map[cellKey(c.species, c.brandId, c.typeId)] = String(c.priceKg);
        }
        setCells(map);
      } catch {
        if (cancelled) return;
        setTypes([]);
        setBrands([]);
        setCells({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Búsqueda case-insensitive por "contiene" sobre TODAS las marcas (sin
  // filtrar por especie: con "ver ambos a la vez" no hay planilla activa). Con
  // query vacío NO se listan todas las marcas: en mostrador primero buscás y
  // después ves resultados.
  const trimmed = query.trim();
  const matches = trimmed
    ? brands.filter((b) =>
        b.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : [];

  // Los tipos se muestran TODOS, cada uno con las especies que le aplican.
  const showPerro = (t: PriceKgType) => t.species !== "GATO";
  const showGato = (t: PriceKgType) => t.species !== "PERRO";

  const openCellPanel = (
    brand: PriceKgBrand,
    type: PriceKgType,
    species: PriceKgSpecies,
  ) => {
    const priceKg = rawCellPrice(cells, species, brand.id, type.id);
    if (priceKg === undefined) return; // celda sin precio: no-op
    setPanelCell({
      brandId: brand.id,
      brandName: brand.name,
      typeId: type.id,
      typeName: type.name,
      species,
      priceKg,
    });
  };

  // ── Venta suelta desde el panel: SIEMPRE con el precio de la celda (C-05) ──

  const toDataItem = (p: CellProduct): DataItem => ({
    _id: p.id,
    id: p.id,
    name: p.name,
    price: p.priceKgSuelto ?? 0,
    priceKgSuelto: p.priceKgSuelto ?? null,
    quantity: p.stock,
    category: p.category,
  });

  const handleSellDirect = async (
    product: CellProduct,
    qty: number,
    mode: SaleMode,
    amount: number,
  ) => {
    if (product.stock <= 0) {
      toast.error("Producto sin stock");
      return;
    }
    if (!panelCell?.priceKg) return;
    try {
      const item = buildCellSaleItem(
        product,
        qty,
        mode,
        amount,
        panelCell.priceKg,
      );
      await createSale({ cart: [item] });
      const qtyLabel = mode === "POR_PESO" ? `${qty} kg` : `$${amount}`;
      toast.success(`Venta realizada — ${qtyLabel} "${product.name}"`);
      setPanelCell(null);
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    }
  };

  const handleAddToCart = (
    product: CellProduct,
    qty: number,
    mode: SaleMode,
    amount: number,
  ) => {
    if (!panelCell?.priceKg) return;
    const actualQty = mode === "POR_MONTO" ? amount : qty;
    cart.addToCart(
      toDataItem(product),
      actualQty,
      branchId ?? "",
      product.stock,
      mode,
      panelCell.priceKg,
    );
    toast.success(`"${product.name}" agregado al pedido`);
    setPanelCell(null);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios por kilo</h1>
        <p className="text-sm text-muted-foreground">
          Consultá el precio de venta por kilo de las marcas
        </p>
      </div>

      {/* Buscador protagonista: input grande con lupa */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="Buscar marca"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá una marca... (ej. Pro Plan, Royal Canin)"
          className="h-12 pl-10 text-lg"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : trimmed === "" ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Escribí el nombre de una marca para ver sus precios por kilo.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Sin resultados para &quot;{trimmed}&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((b) => (
            <Card key={b.id}>
              <CardContent className="pt-6">
                <h2 className="text-xl font-bold">{b.name}</h2>
                {/* Grilla de tipos con un precio etiquetado por especie */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {types.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border bg-muted/50 p-4"
                    >
                      <p className="text-sm text-muted-foreground">{t.name}</p>
                      <div className="mt-2 space-y-2">
                        {showPerro(t) &&
                          (rawCellPrice(cells, "PERRO", b.id, t.id) !==
                          undefined ? (
                            <button
                              type="button"
                              aria-label={`Abrir venta suelta: ${b.name} ${t.name} Perro`}
                              onClick={() => openCellPanel(b, t, "PERRO")}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-background hover:shadow-sm cursor-pointer"
                            >
                              <Badge variant="outline">Perro</Badge>
                              <span className="text-3xl font-bold tabular-nums">
                                {formatPrice(
                                  rawCellPrice(cells, "PERRO", b.id, t.id)!,
                                )}
                              </span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline">Perro</Badge>
                              <span className="text-3xl font-bold tabular-nums text-muted-foreground/50">
                                —
                              </span>
                            </div>
                          ))}
                        {showGato(t) &&
                          (rawCellPrice(cells, "GATO", b.id, t.id) !==
                          undefined ? (
                            <button
                              type="button"
                              aria-label={`Abrir venta suelta: ${b.name} ${t.name} Gato`}
                              onClick={() => openCellPanel(b, t, "GATO")}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left transition-colors hover:bg-background hover:shadow-sm cursor-pointer"
                            >
                              <Badge variant="outline">Gato</Badge>
                              <span className="text-3xl font-bold tabular-nums">
                                {formatPrice(
                                  rawCellPrice(cells, "GATO", b.id, t.id)!,
                                )}
                              </span>
                            </button>
                          ) : (
                            <div className="flex items-center justify-between gap-2">
                              <Badge variant="outline">Gato</Badge>
                              <span className="text-3xl font-bold tabular-nums text-muted-foreground/50">
                                —
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Panel de venta suelta de la celda seleccionada */}
      <PriceKgProductPanel
        open={!!panelCell}
        cell={panelCell}
        onClose={() => setPanelCell(null)}
        onSellDirect={handleSellDirect}
        onAddToCart={handleAddToCart}
        onCreateProduct={() => {
          toast.info("Creá el producto desde Productos y luego volvé a esta celda");
        }}
      />
    </div>
  );
};