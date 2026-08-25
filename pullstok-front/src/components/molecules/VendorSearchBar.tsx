import { useState } from "react";
import type { RefObject } from "react";
import { Search, X, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
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

const SHORTCUTS: [string, string][] = [
  ["/", "Buscador"],
  ["↓/Enter", "Ir a Lista"],
  ["↑/↓", "Navegar"],
  ["Enter", "Elegir"],
  ["+ / −", "Cantidad"],
  ["→", "Pedido"],
  ["T", "Cambiar tab"],
  ["V", "Vender"],
  ["P", "Guardar pedido"],
];

export const VendorSearchBar = ({
  value,
  onChange,
  selectedIndex,
  items,
  onOpenQty,
  inputRef,
}: VendorSearchBarProps) => {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            className="pl-10 pr-10 text-lg h-12"
            placeholder="Buscar por nombre, código, categoría o variante... [/]"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
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
                setShowHelp(false);
              }
            }}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Ayuda de atajos de teclado"
            onClick={() => setShowHelp((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <CircleHelp className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Ayuda de atajos (popover) */}
      {showHelp && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border bg-popover p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">
              Atajos
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setShowHelp(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="space-y-1.5">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 text-xs">
                <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {key}
                </kbd>
                <span className="text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
