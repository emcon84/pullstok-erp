import { useState, useEffect } from "react";
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
import type { SaleMode } from "@/components/hooks/useVendorCart";
import { useVendorCart } from "@/components/hooks/useVendorCart";
import { useCreateSale } from "@/components/hooks/useSales";
import type { PaymentInput } from "@/models/cashSessionModel";
import {
  PriceKgProductPanel,
  buildCellSaleItem,
  type CellContext,
} from "@/components/molecules/PriceKgProductPanel";

type VendorCart = ReturnType<typeof useVendorCart>;

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

// Una celda retiene su precio (String, para el formato) y el id de la celda
// PriceKgPrice: ese id es el loosePriceId que identifica la línea suelta al
// vender (loose-lines-stock).
interface CellPriceEntry {
  priceKg: string;
  priceKgPriceId: string;
}

const cellPriceEntry = (
  cells: Record<string, CellPriceEntry>,
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
): CellPriceEntry | undefined => {
  const entry = cells[cellKey(species, brandId, typeId)];
  if (!entry) return undefined;
  if (entry.priceKg.trim() === "") return undefined;
  const n = parseFloat(entry.priceKg);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return entry;
};

// Precio NUMÉRICO de una celda (o undefined si no existe): la fuente
// autoritativa del precio suelto (sdd/precios-suelto-planilla C-05).
const rawCellPrice = (
  cells: Record<string, CellPriceEntry>,
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
): number | undefined => {
  const entry = cellPriceEntry(cells, species, brandId, typeId);
  if (!entry) return undefined;
  return parseFloat(entry.priceKg);
};

// Los tipos se muestran TODOS, cada uno con las especies que le aplican.
const showPerro = (t: PriceKgType) => t.species !== "GATO";
const showGato = (t: PriceKgType) => t.species !== "PERRO";

interface LooseSellTabProps {
  /** Sucursal del vendedor (BranchMode single). Definida para el VENDEDOR. */
  branchId: string;
  /** Carrito compartido del POS unificado (la misma instancia de "Por unidad"). */
  cart: VendorCart;
}

/**
 * Tab "Suelto" del POS unificado: búsqueda de la planilla (marca → tipo/celda)
 * que vende por kg o por monto. Reusa los mismos servicios y el PriceKgProductPanel
 * que PriceKgLookup, pero agrega al MISMO carrito compartido (prop cart) y NO
 * muestra FAB ni sheet (viven en UnifiedPos).
 */
export const LooseSellTab = ({ branchId, cart }: LooseSellTabProps) => {
  const [query, setQuery] = useState("");
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [brands, setBrands] = useState<PriceKgBrand[]>([]);
  const [cells, setCells] = useState<Record<string, CellPriceEntry>>({});
  const [loading, setLoading] = useState(true);
  const [panelCell, setPanelCell] = useState<CellContext | null>(null);

  const { createSale } = useCreateSale();

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
        const map: Record<string, CellPriceEntry> = {};
        for (const c of plan) {
          map[cellKey(c.species, c.brandId, c.typeId)] = {
            priceKg: String(c.priceKg),
            priceKgPriceId: c.id,
          };
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
  const openCellPanel = (
    brand: PriceKgBrand,
    type: PriceKgType,
    species: PriceKgSpecies,
  ) => {
    const entry = cellPriceEntry(cells, species, brand.id, type.id);
    if (!entry) return; // celda sin precio: no-op
    setPanelCell({
      brandId: brand.id,
      brandName: brand.name,
      typeId: type.id,
      typeName: type.name,
      species,
      priceKg: parseFloat(entry.priceKg),
      cellId: entry.priceKgPriceId,
    });
  };

  // ── Venta suelta desde la celda: SIEMPRE con el precio de la celda (C-05) ──

  const handleSellDirect = async (
    qty: number,
    mode: SaleMode,
    amount: number,
    payments: PaymentInput[],
    discountPct: number = 0,
  ) => {
    if (!panelCell?.priceKg) return;
    const looseName = [panelCell.brandName, panelCell.typeName]
      .filter(Boolean)
      .join(" · ");
    try {
      const item = buildCellSaleItem(panelCell, qty, mode, amount);
      await createSale({ cart: [item], payments, discountPct });
      const qtyLabel = mode === "POR_PESO" ? `${qty} kg` : `$${amount}`;
      toast.success(`Venta realizada — ${qtyLabel} "${looseName}"`);
      setPanelCell(null);
    } catch (err: any) {
      toast.error(err?.message || "Error al realizar la venta directa");
    }
  };

  const handleAddToCart = (qty: number, mode: SaleMode, amount: number) => {
    if (!panelCell?.priceKg) return;
    const actualQty = mode === "POR_MONTO" ? amount : qty;
    const looseName = [panelCell.brandName, panelCell.typeName]
      .filter(Boolean)
      .join(" · ");
    const cellId = panelCell.cellId ?? "";
    cart.addToCart(
      {
        _id: cellId,
        id: cellId,
        name: looseName,
        price: panelCell.priceKg,
        priceKgSuelto: panelCell.priceKg,
        quantity: 0,
        category: "",
      },
      actualQty,
      branchId,
      // El stock de la línea lo resuelve el panel (getLooseStock); el carrito
      // solo acumula el item suelto, que vende el backend contra LooseStock.
      0,
      mode,
      panelCell.priceKg,
      panelCell.cellId ?? undefined,
      looseName,
    );
    toast.success(`"${looseName}" agregado al pedido`);
    setPanelCell(null);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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

      {/* Modal de venta suelta de la celda seleccionada. key=cellId remontea el
        panel por celda → el estado del formulario queda limpio en cada apertura. */}
      <PriceKgProductPanel
        key={panelCell?.cellId ?? "closed"}
        open={!!panelCell}
        cell={panelCell}
        branchId={branchId}
        onClose={() => setPanelCell(null)}
        onSellDirect={handleSellDirect}
        onAddToCart={handleAddToCart}
      />
    </div>
  );
};
