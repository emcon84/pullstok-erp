import { useState } from "react";
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

const PAGE_SIZE = 8;
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
  branchMode?: boolean;
}

export const ProductsTable = ({ products, onEdit, onDuplicate, branchMode }: ProductsTableProps) => {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "code" | "quantity" | "price">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { deleteProduct, loading } = useDeleteProduct();
  const confirm = useConfirm();

  const branchQty = (p: DataItem) =>
    branchMode
      ? Number(p.stocks?.[0]?.quantity ?? 0)
      : Number(p.stocks?.[0]?.quantity ?? p.quantity);

  const sorted = [...products].sort((a, b) => {
    const aVal = sortBy === "quantity" ? branchQty(a) : sortBy === "price" ? Number(a.price) : (a[sortBy] || "").toString().toLowerCase();
    const bVal = sortBy === "quantity" ? branchQty(b) : sortBy === "price" ? Number(b.price) : (b[sortBy] || "").toString().toLowerCase();
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const slice = sorted.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

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

            return (
              <TableRow
                key={id}
                className="relative flex cursor-pointer flex-wrap items-center gap-y-2 py-3 pl-3 pr-3 hover:bg-muted/50 sm:table-row sm:flex-nowrap sm:items-center sm:gap-0 sm:py-0 sm:pl-0 sm:pr-0"
                onClick={() => onEdit(p)}
              >
                {/* Línea 1 (mobile): imagen + nombre + precio a la derecha.
                    Desktop: columna Producto (el precio vive en su propia columna). */}
                <TableCell className="w-full min-w-0 p-0 sm:w-auto sm:flex-none sm:table-cell sm:p-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
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
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {p.code || "—"}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums sm:hidden">
                      ${Number(p.price).toLocaleString("es-AR")}
                    </span>
                  </div>
                </TableCell>

                {/* Línea 2 (mobile): Categoría · Stock. Desktop: columnas propias. */}
                <TableCell className="min-w-0 flex-1 p-0 sm:flex-none sm:w-auto sm:table-cell sm:p-2">
                  <span className="block truncate text-sm text-muted-foreground sm:inline sm:overflow-visible sm:whitespace-normal">
                    {(p.category as any)?.name || p.category || "—"}
                  </span>
                </TableCell>
                <TableCell className="flex-1 text-right p-0 sm:flex-none sm:w-auto sm:table-cell sm:p-2 sm:text-center">
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
                    {qty <= 0 ? "Sin stock" : `${qty} u.`}
                  </Badge>
                </TableCell>

                {/* Precio — solo desktop (en mobile va en la línea 1) */}
                <TableCell className="hidden text-right font-medium tabular-nums sm:table-cell sm:p-2">
                  ${Number(p.price).toLocaleString("es-AR")}
                </TableCell>

                {/* Línea 3 (mobile): acciones abajo a la derecha. Desktop: última columna. */}
                <TableCell className="w-full min-w-0 p-0 pt-1 sm:w-auto sm:flex-none sm:table-cell sm:p-2 sm:text-right">
                  <div className="flex justify-end gap-1">
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
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
    </Card>
  );
};
