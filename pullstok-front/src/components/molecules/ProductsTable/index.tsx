import { useState } from "react";
import {
  Pencil,
  Trash2,
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
}

export const ProductsTable = ({ products, onEdit }: ProductsTableProps) => {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"name" | "code" | "quantity" | "price">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const { deleteProduct, loading } = useDeleteProduct();
  const confirm = useConfirm();

  const sorted = [...products].sort((a, b) => {
    const aVal = sortBy === "quantity" ? Number(a.quantity) : sortBy === "price" ? Number(a.price) : (a[sortBy] || "").toString().toLowerCase();
    const bVal = sortBy === "quantity" ? Number(b.quantity) : sortBy === "price" ? Number(b.price) : (b[sortBy] || "").toString().toLowerCase();
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
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}>
              <div className="flex items-center gap-1">Producto <SortIcon col="name" /></div>
            </TableHead>
            <TableHead className="cursor-pointer select-none hidden sm:table-cell" onClick={() => toggleSort("code")}>
              <div className="flex items-center gap-1">Código <SortIcon col="code" /></div>
            </TableHead>
            <TableHead>Categoría</TableHead>
            <TableHead>Variantes</TableHead>
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
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-32 text-center text-muted-foreground"
              >
                No hay productos todavía.
              </TableCell>
            </TableRow>
          )}
          {slice.map((p) => {
            const id = p._id || p.id;
            const qty = Number(p.quantity);
            const src = imgSrc(p.image);

            // Build variant labels from API response
            const variantLabels = p.variantAssignments
              ?.map(
                (pv: any) =>
                  `${pv.option?.variant?.name ?? ""}: ${pv.option?.value ?? ""}`,
              )
              .join(", ");

            return (
              <TableRow key={id}>
                <TableCell>
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
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{p.name}</p>
                      {p.description && (
                        <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className="text-xs text-muted-foreground font-mono">
                    {p.code || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {(p.category as any)?.name || p.category || "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {variantLabels || "—"}
                  </span>
                </TableCell>
                <TableCell className="text-center">
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
                <TableCell className="text-right font-medium tabular-nums">
                  ${Number(p.price).toLocaleString("es-AR")}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={loading}
                      onClick={() => handleDelete(id)}
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
