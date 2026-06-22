import { useState } from "react";
import { Search, Minus, Plus, ImageIcon, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL } from "../../../constants";
import { ProductsProps } from "../../../models/productsModel";

interface SelectedProduct {
  product: ProductsProps;
  quantity: number;
}

interface ProductSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  products: ProductsProps[];
  onConfirm: (selectedProducts: SelectedProduct[]) => void;
}

const imgSrc = (image?: string) =>
  image
    ? image.startsWith("http")
      ? image
      : `${API_URL.replace("/api", "")}${image}`
    : null;

export const ProductSelector = ({
  open,
  onOpenChange,
  products,
  onConfirm,
}: ProductSelectorProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<Map<string, SelectedProduct>>(
    new Map(),
  );

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const toggle = (product: ProductsProps) => {
    const id = product._id || product.id || "";
    const next = new Map(selected);
    if (next.has(id)) next.delete(id);
    else next.set(id, { product, quantity: 1 });
    setSelected(next);
  };

  const setQty = (id: string, qty: number) => {
    if (qty < 1) return;
    const next = new Map(selected);
    const item = next.get(id);
    if (item) {
      next.set(id, { ...item, quantity: qty });
      setSelected(next);
    }
  };

  const confirm = () => {
    onConfirm(Array.from(selected.values()));
    setSelected(new Map());
    setSearchTerm("");
    onOpenChange(false);
  };

  const close = () => {
    setSelected(new Map());
    setSearchTerm("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-4">
          <DialogTitle>Seleccionar productos</DialogTitle>
        </DialogHeader>

        <div className="border-b p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar productos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No se encontraron productos.
            </p>
          )}
          {filtered.map((product) => {
            const id = product._id || product.id || "";
            const isSel = selected.has(id);
            const item = selected.get(id);
            const qty = Number(product.quantity);
            const src = imgSrc(product.image);
            return (
              <div
                key={id}
                className={cn(
                  "flex items-center gap-3 rounded-lg p-2 transition-colors",
                  isSel ? "bg-accent" : "hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  onClick={() => toggle(product)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <div
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                      isSel
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {isSel && <Check className="h-3.5 w-3.5" />}
                  </div>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                    {src ? (
                      <img
                        src={src}
                        alt={product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      ${Number(product.price).toLocaleString("es-AR")} · Stock{" "}
                      {qty}
                    </p>
                  </div>
                </button>
                {isSel && (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(id, (item?.quantity || 1) - 1)}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <input
                      type="number"
                      min={1}
                      value={item?.quantity || 1}
                      onChange={(e) =>
                        setQty(id, parseInt(e.target.value) || 1)
                      }
                      className="h-7 w-12 rounded-md border border-input text-center text-sm"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setQty(id, (item?.quantity || 1) + 1)}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <DialogFooter className="flex-row items-center justify-between border-t p-4 sm:justify-between">
          <span className="text-sm text-muted-foreground">
            {selected.size} seleccionado{selected.size === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={close}>
              Cancelar
            </Button>
            <Button onClick={confirm} disabled={selected.size === 0}>
              Agregar productos
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
