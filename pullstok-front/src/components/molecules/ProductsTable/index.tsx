import { useEffect, useRef, useState } from "react";
import {
  Pencil,
  Trash2,
  Copy,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ImageIcon,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  BadgeDollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteProduct } from "../../hooks/useProducts";
import { useConfirm } from "../../hooks/useConfirm";
import { API_URL } from "../../../constants";
import { DataItem } from "../../../types";
import {
  unitStock,
  stockUnitLabel,
} from "../../hooks/vendorCatalogHelpers";

// Selector de filas por página (dashboard del admin): 10/20/50.
const PAGE_SIZES = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 10;
const LOW_STOCK = 5;

const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http")
    ? image
    : `${API_URL.replace("/api", "")}${image}`;
};

interface ProductsTableProps {
  products: DataItem[];
  onEdit: (product: DataItem) => void;
  onDuplicate: (product: DataItem) => void;
  onQuickPrice: (product: DataItem) => void;
  branchMode?: boolean;
}

export const ProductsTable = ({ products, onEdit, onDuplicate, onQuickPrice, branchMode }: ProductsTableProps) => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [sortBy, setSortBy] = useState<"name" | "code" | "quantity" | "price">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { deleteProduct, loading } = useDeleteProduct();
  const confirm = useConfirm();

  // branchMode (filtro por sucursal): stocks[0] es ESA sucursal (unidades); si
  // no hay fila se muestra 0 (es lo real de la sucursal, NO el legacy). En modo
  // global (sin branchId) la API NO adjunta stocks, así que se usa unitStock,
  // que convierte products.quantity (kg legacy) a bolsas.
  const branchQty = (p: DataItem) =>
    branchMode
      ? Number(p.stocks?.[0]?.quantity ?? 0)
      : unitStock(p);

  const sorted = [...products].sort((a, b) => {
    const aQty = branchQty(a);
    const bQty = branchQty(b);
    const aHasStock = aQty > 0 ? 1 : 0;
    const bHasStock = bQty > 0 ? 1 : 0;

    // Regla principal: productos CON STOCK (>0) SIEMPRE primero que SIN STOCK (<=0)
    if (aHasStock !== bHasStock) {
      return bHasStock - aHasStock;
    }

    // Regla secundaria: orden por la columna elegida dentro de cada grupo
    const aVal = sortBy === "quantity" ? aQty : sortBy === "price" ? Number(a.price ?? 0) : (a[sortBy] || "").toString().toLowerCase();
    const bVal = sortBy === "quantity" ? bQty : sortBy === "price" ? Number(b.price ?? 0) : (b[sortBy] || "").toString().toLowerCase();
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, totalPages);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);

  const handlePageSizeChange = (size: number) => {
    setPageSize(size);
    setPage(1);
  };

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
    setPage(1);
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => {
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    const ok = await confirm({
      title: "¿Eliminar producto?",
      description:
        "El producto se eliminará de tu inventario. Esta acción no se puede deshacer.",
      confirmLabel: "Sí, eliminar",
      danger: true,
    });
    if (ok) deleteProduct(id);
  };

  // Acceso rápido por teclado: ↑/↓ navegan los productos visibles y Enter (o
  // Ctrl+Shift+P) abre el modal de edición rápida de precio del seleccionado.
  // Mismo patrón de listener en fase capture que useVendorKeyboard, y lee las
  // opciones desde un ref para no re-registrarse en cada render.
  const keyboardOptionsRef = useRef({
    sorted,
    selectedIndex,
    onQuickPrice,
    isDialogOpen: () => document.querySelector('[role="dialog"]') !== null,
  });
  useEffect(() => {
    keyboardOptionsRef.current = {
      sorted,
      selectedIndex,
      onQuickPrice,
      isDialogOpen: () => document.querySelector('[role="dialog"]') !== null,
    };
  }, [sorted, selectedIndex, onQuickPrice]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const o = keyboardOptionsRef.current;

      // Si hay un dialog/modal abierto (confirm, drawer, quick price) el
      // teclado no interfiere: el modal es el dueño.
      if (o.isDialogOpen()) return;

      const activeElement = document.activeElement;
      const isTypingInInput =
        activeElement &&
        (activeElement.tagName === "INPUT" ||
          activeElement.tagName === "TEXTAREA" ||
          (activeElement as HTMLElement).isContentEditable);

      const isQuickPrice =
        (e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === "p" || e.key === "P");

      if (isQuickPrice) {
        e.preventDefault();
        e.stopPropagation();
        if (o.sorted.length > 0) {
          const idx = o.selectedIndex >= 0 ? o.selectedIndex : 0;
          o.onQuickPrice(o.sorted[idx]);
        }
        return;
      }

      if (e.key === "ArrowDown" && o.sorted.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (isTypingInInput) (document.activeElement as HTMLElement)?.blur();
        setSelectedIndex((prev) =>
          prev < 0 ? 0 : Math.min(o.sorted.length - 1, prev + 1),
        );
        return;
      }

      if (e.key === "ArrowUp" && o.sorted.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        if (isTypingInInput) (document.activeElement as HTMLElement)?.blur();
        setSelectedIndex((prev) => (prev <= 0 ? 0 : prev - 1));
        return;
      }

      if (e.key === "Enter" && !isTypingInInput) {
        if (o.selectedIndex >= 0 && o.selectedIndex < o.sorted.length) {
          e.preventDefault();
          e.stopPropagation();
          o.onQuickPrice(o.sorted[o.selectedIndex]);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // Al cambiar la lista (búsqueda/filtros) la selección se resetea y se
  // asegura que la fila seleccionada quede visible en su página.
  useEffect(() => {
    setSelectedIndex(-1);
  }, [products]);

  useEffect(() => {
    if (selectedIndex < 0) return;
    const targetPage = Math.floor(selectedIndex / pageSize) + 1;
    if (targetPage !== current) setPage(targetPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, pageSize]);

  return (
    <Card className="overflow-hidden p-0">
      {/* Sort compacto — solo mobile, porque en mobile no hay header con columnas */}
      <div className="flex items-center gap-2 border-b px-3 py-2 sm:hidden">
        <Select
          value={sortBy}
          onValueChange={(v) => toggleSort(v as typeof sortBy)}
        >
          <SelectTrigger className="h-8 w-full" aria-label="Ordenar productos por">
            <SelectValue placeholder="Ordenar por" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Producto</SelectItem>
            <SelectItem value="quantity">Stock</SelectItem>
            <SelectItem value="price">Precio</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0"
          title={sortDir === "asc" ? "Ascendente" : "Descendente"}
          onClick={() => { setSortDir(d => d === "asc" ? "desc" : "asc"); setPage(1); }}
        >
          {sortDir === "asc" ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Table>
        <TableHeader className="hidden sm:table-header-group">
          <TableRow className="hover:bg-transparent">
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
              <div className="flex items-center gap-1">Producto <SortIcon col="name" /></div>
            </TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead className="text-center cursor-pointer select-none" onClick={() => toggleSort("quantity")}>
              <div className="flex items-center justify-center gap-1">Stock <SortIcon col="quantity" /></div>
            </TableHead>
            <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("price")}>
              <div className="flex items-center justify-end gap-1">Precio <SortIcon col="price" /></div>
            </TableHead>
            <TableHead className="w-[100px] text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {slice.length === 0 && (
            <TableRow className="flex w-full sm:table-row">
              <TableCell
                colSpan={5}
                className="w-full h-32 text-center text-muted-foreground sm:table-cell"
              >
                No hay productos todavía.
              </TableCell>
            </TableRow>
          )}
          {slice.map((p) => {
            const id = p._id || p.id;
            const qty = branchQty(p);
            const src = imgSrc(p.image);
            const isSelected = selectedIndex >= 0 && sorted[selectedIndex] === p;

            return (
              <TableRow
                key={id}
                className={cn(
                  "relative cursor-pointer hover:bg-muted/50 sm:table-row [&>td]:!whitespace-normal [&>td]:min-w-0",
                  isSelected && "bg-primary/5",
                )}
                onClick={() => onEdit(p)}
              >
                {/* Celda "producto". En mobile renderiza el card del diseño:
                    imagen fija a la izq, nombre (con scroll si desborda) + stock + acciones al centro,
                    divisor vertical + precio con ancho fijo a la derecha.
                    En desktop conserva la fila clásica. */}
                <TableCell className="p-0 sm:table-cell sm:p-2">
                  <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-0 sm:py-0 w-full max-w-full overflow-hidden">
                    {/* Imagen — fija en mobile y desktop */}
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted sm:h-10 sm:w-10">
                      {src ? (
                        <img
                          src={src}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>

                    {/* Centro: nombre (con scroll horizontal interno si desborda) + stock + acciones */}
                    <div className="min-w-0 flex-1 overflow-hidden flex flex-col justify-center">
                      {/* Desktop: nombre simple */}
                      <p className="hidden font-medium leading-tight sm:block">{p.name}</p>

                      {/* Mobile: nombre se cae en 2 renglones (con scroll vertical interno si es super largo) */}
                      <div className="max-h-10 overflow-y-auto break-words text-sm font-medium leading-tight sm:hidden scrollbar-none">
                        {p.name}
                      </div>
                      <p className="text-[11px] text-muted-foreground font-mono leading-none mt-0.5">{p.code || "—"}</p>

                      {/* Mobile: badge de stock + acciones en la misma fila */}
                      <div className="mt-1 flex items-center justify-between gap-1.5 overflow-x-auto scrollbar-none sm:hidden">
                        <Badge
                          variant="outline"
                          className={cn(
                            "shrink-0 font-medium text-[11px] px-1.5 py-0",
                            qty <= 0
                              ? "border-destructive/30 bg-destructive/10 text-destructive"
                              : qty <= LOW_STOCK
                                ? "border-amber-300 bg-amber-50 text-amber-700"
                                : "border-emerald-300 bg-emerald-50 text-emerald-700",
                          )}
                        >
                          {qty <= 0 ? "Sin stock" : `${qty} ${stockUnitLabel(p)}`}
                        </Badge>
                        <div className="flex gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Actualizar precio rápido"
                            onClick={(e) => { e.stopPropagation(); onQuickPrice(p); }}
                          >
                            <BadgeDollarSign className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Duplicar producto"
                            onClick={(e) => { e.stopPropagation(); onDuplicate(p); }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={loading}
                            onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Derecha (mobile): divisor vertical + precio con ancho fijo garantizado */}
                    <div className="flex shrink-0 w-[82px] min-w-[82px] flex-col justify-center items-end border-l pl-2 text-right sm:hidden">
                      <p className="text-sm font-semibold tabular-nums leading-tight">
                        ${Number(p.price ?? 0).toLocaleString("es-AR")}
                      </p>
                    </div>
                  </div>
                </TableCell>

                {/* Columnas desktop — ocultas en mobile */}
                <TableCell className="hidden sm:table-cell">
                  <span className="text-sm text-muted-foreground">
                    {(p.category as any)?.name || p.category || "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden text-center sm:table-cell">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium",
                      qty <= 0
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : qty <= LOW_STOCK
                          ? "border-amber-300 bg-amber-50 text-amber-700"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {qty <= 0 ? "Sin stock" : `${qty} ${stockUnitLabel(p)}`}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell">
                  ${Number(p.price ?? 0).toLocaleString("es-AR")}
                </TableCell>
                <TableCell className="hidden sm:table-cell sm:text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Actualizar precio rápido (Ctrl+Shift+P)"
                      onClick={(e) => { e.stopPropagation(); onQuickPrice(p); }}
                    >
                      <BadgeDollarSign className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Duplicar producto"
                      onClick={(e) => { e.stopPropagation(); onDuplicate(p); }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); onEdit(p); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={loading}
                      onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {sorted.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Ver</span>
            <Select
              value={pageSize.toString()}
              onValueChange={(v) => handlePageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-auto gap-1 pr-2" aria-label="Productos por página">
                <SelectValue placeholder="10" />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((s) => (
                  <SelectItem key={s} value={s.toString()}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              Mostrando {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, sorted.length)} de {sorted.length}
            </span>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">
                Página {current} de {totalPages}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={current === 1}
                  onClick={() => setPage(1)}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={current === 1}
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={current === totalPages}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={current === totalPages}
                  onClick={() => setPage(totalPages)}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
