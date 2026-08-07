import type { RefObject } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { DataItem } from "@/types";

interface VendorSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  selectedIndex: number;
  items: DataItem[];
  onOpenQty: (product: DataItem) => void;
  inputRef: RefObject<HTMLInputElement>;
}

export const VendorSearchBar = ({
  value,
  onChange,
  selectedIndex,
  items,
  onOpenQty,
  inputRef,
}: VendorSearchBarProps) => (
  <>
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        className="pl-10 text-lg h-12"
        placeholder="Buscar por nombre, código, categoría o variante... [/]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            // Dejamos que el handler global navegue (↑/↓ son de la lista global)
            return;
          }
          if (e.key === "Enter") {
            // Si ya hay un ítem seleccionado con ↓, abrir ese; si no, el primero.
            e.preventDefault();
            if (selectedIndex >= 0 && selectedIndex < items.length) {
              onOpenQty(items[selectedIndex]);
            } else if (items.length > 0) {
              onOpenQty(items[0]);
            }
            return;
          }
          if (e.key === "Escape") {
            e.preventDefault();
            inputRef.current?.blur();
          }
        }}
        autoFocus
      />
    </div>

    {/* Legend de atajos de teclado */}
    <div className="hidden sm:flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
      <span className="font-semibold text-foreground">Atajos:</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">/</kbd>
      <span>Buscador</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">↓/Enter</kbd>
      <span>Ir a Lista</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">↑/↓</kbd>
      <span>Navegar</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">Enter</kbd>
      <span>Elegir</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">V</kbd>
      <span>Venta directa</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">P</kbd>
      <span>Pedido</span>
      <span className="text-muted-foreground/40">•</span>
      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono shadow-sm">C</kbd>
      <span>Ver pedido</span>
    </div>
  </>
);
