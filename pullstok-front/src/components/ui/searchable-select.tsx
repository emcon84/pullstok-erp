import * as React from "react";
import { CheckIcon, ChevronDown, Search } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  /** Placeholder del input de búsqueda dentro del panel. */
  searchPlaceholder?: string;
  /** Mensaje cuando la búsqueda no devuelve resultados. */
  emptyMessage?: string;
  id?: string;
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
}

/** Normaliza para matching: sin acentos, minúsculas (así "canin" matchea "Canin"). */
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/**
 * Select con búsqueda integrada (combobox de un solo paso): al abrir el panel
 * se enfoca un input que filtra la lista en vivo. Reemplaza el patrón
 * "input de filtro + Select separado" (dos pasos) del OpenBagDialog.
 *
 * - Filtra client-side por substring, ignorando acentos y mayúsculas.
 * - Teclado: ↑/↓ mueven el resaltado, Enter selecciona, Esc cierra.
 * - Se apoya en radix-ui (Popover), ya presente en el proyecto: sin deps nuevas.
 */
export const SearchableSelect = ({
  value,
  onValueChange,
  options,
  placeholder = "Seleccioná una opción",
  searchPlaceholder = "Buscar…",
  emptyMessage = "Sin resultados",
  id,
  ariaLabel,
  className,
  disabled,
}: SearchableSelectProps) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [highlight, setHighlight] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;

  const filtered = React.useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return options;
    return options.filter((o) => normalize(o.label).includes(q));
  }, [options, query]);

  // Al abrir: limpiar la búsqueda y posicionar el resaltado en la selección.
  React.useEffect(() => {
    if (!open) return;
    setQuery("");
    const idx = options.findIndex((o) => o.value === value);
    setHighlight(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  // Mantener el resaltado dentro de la lista filtrada.
  React.useEffect(() => {
    setHighlight((h) => Math.min(h, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  // Scroll para que el ítem resaltado quede visible.
  React.useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${highlight}"]`,
    );
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [highlight, open]);

  const handleSelect = React.useCallback(
    (optionValue: string) => {
      onValueChange(optionValue);
      setOpen(false);
    },
    [onValueChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = filtered[highlight];
      if (option) handleSelect(option.value);
    }
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-sm whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
            className,
          )}
        >
          <span
            className={cn(
              "flex-1 truncate text-left",
              !selected && "text-muted-foreground",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlight(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-8 pl-8"
              />
            </div>
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-60 overflow-y-auto p-1"
          >
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </p>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => handleSelect(option.value)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-2 pl-2 text-left text-sm outline-none",
                      index === highlight
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/50",
                    )}
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                    {isSelected && (
                      <CheckIcon className="size-4 shrink-0 text-primary" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
