import { useEffect, useRef, useState } from "react";
import { Link2, Search } from "lucide-react";
import { toast } from "react-toastify";
import { API_URL } from "@/constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addProductBarcode } from "@/services/productService";
import type { DataItem } from "@/types";

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 12;

interface AssignBarcodeDialogProps {
  barcode: string | null;
  open: boolean;
  onClose: () => void;
  onAssigned?: (product: DataItem) => void;
}

// The API may return the category as a plain name or as a populated object.
const categoryLabel = (category: unknown): string | undefined =>
  typeof category === "string" ? category : (category as { name?: string } | null)?.name;

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("token") || ""}`,
  "Content-Type": "application/json",
});

/**
 * "Vincular código": the USB gun scanned a barcode no product owns. The user
 * searches the product by name and the barcode is saved on it (PC counterpart
 * of the assign panel in StockScannerPage). Arrow keys + Enter pick a result.
 */
export const AssignBarcodeDialog = ({
  barcode,
  open,
  onClose,
  onAssigned,
}: AssignBarcodeDialogProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DataItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  // Product that already has a primary barcode: the user picks add vs replace.
  const [choosing, setChoosing] = useState<DataItem | null>(null);
  const requestId = useRef(0);

  // Fresh state every time the dialog opens for a (new) code.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setHighlighted(-1);
      setAssigning(false);
      setChoosing(null);
    }
  }, [open, barcode]);

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    if (!open || q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/products?name=${encodeURIComponent(q)}`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (id !== requestId.current) return; // stale response
        setResults((Array.isArray(data) ? data : []).slice(0, MAX_RESULTS));
        setHighlighted(-1);
      } catch {
        if (id !== requestId.current) return;
        setResults([]);
        toast.error("Error al buscar");
      }
      if (id === requestId.current) setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, open]);

  const replacePrimary = async (product: DataItem) => {
    const productId = product.id ?? product._id;
    if (!productId || !barcode || assigning) return;
    setAssigning(true);
    try {
      const res = await fetch(`${API_URL}/products/${productId}`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ barcode }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("¡Código asignado!");
        onAssigned?.(data);
        onClose();
      } else {
        toast.error(data.message || "Error al asignar código");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setAssigning(false);
  };

  const addAdditional = async (product: DataItem) => {
    const productId = product.id ?? product._id;
    if (!productId || !barcode || assigning) return;
    setAssigning(true);
    try {
      const alias = await addProductBarcode(productId, barcode);
      toast.success("Código adicional agregado");
      onAssigned?.({ ...product, barcodes: [...(product.barcodes ?? []), alias] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al agregar código");
    }
    setAssigning(false);
  };

  // Products without a barcode keep the direct flow; otherwise ask add vs replace.
  const assign = async (product: DataItem) => {
    if (product.barcode) {
      setChoosing(product);
      return;
    }
    await replacePrimary(product);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlighted >= 0 && results[highlighted]) {
      e.preventDefault();
      void assign(results[highlighted]);
    }
  };

  return (
    <Dialog open={open && !!barcode} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular código</DialogTitle>
          <DialogDescription>
            Este código no está asociado a ningún producto.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center">
          <p className="text-xs font-medium text-amber-600">Código escaneado</p>
          <p className="mt-0.5 font-mono text-xl font-bold text-amber-800">{barcode}</p>
        </div>

        {choosing ? (
          <div className="space-y-3">
            <div className="rounded-lg border px-4 py-3">
              <p className="text-sm font-medium leading-snug">{choosing.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ya tiene el código{" "}
                <span className="font-mono font-semibold">{choosing.barcode}</span>
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button disabled={assigning} onClick={() => void addAdditional(choosing)}>
                Agregar como código adicional
              </Button>
              <Button
                variant="outline"
                disabled={assigning}
                onClick={() => void replacePrimary(choosing)}
              >
                Reemplazar código
              </Button>
              <Button variant="ghost" disabled={assigning} onClick={() => setChoosing(null)}>
                Elegir otro producto
              </Button>
            </div>
          </div>
        ) : (
          <>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="pl-9"
            placeholder="Buscá el producto por nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {searching && (
            <p className="py-4 text-center text-sm text-muted-foreground">Buscando...</p>
          )}
          {!searching && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Sin resultados. Probá con menos palabras.
            </p>
          )}
          {results.map((p, i) => (
            <button
              key={p.id ?? p._id}
              type="button"
              disabled={assigning}
              onClick={() => void assign(p)}
              className={cn(
                "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left hover:border-primary/30 hover:bg-primary/5 disabled:opacity-50",
                i === highlighted ? "border-primary/40 bg-primary/5" : "border-transparent",
              )}
            >
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug">{p.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {p.code || "—"}
                </span>
                {p.variantAssignments?.length > 0 ? (
                  <span className="mt-1.5 flex flex-wrap gap-1">
                    {p.variantAssignments.map((va: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="px-1.5 py-0.5 text-[11px]">
                        {va.option.variant.name}: {va.option.value}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  categoryLabel(p.category) && (
                    <Badge variant="outline" className="mt-1.5 px-1.5 py-0.5 text-[11px]">
                      {categoryLabel(p.category)}
                    </Badge>
                  )
                )}
              </span>
            </button>
          ))}
        </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={assigning}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
