import { useMemo, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DataItem } from "@/types";

// ── Types ──

export interface FilterChipsProps {
  products: DataItem[];
  filter: string;
  categoryFilter: string;
  onFilterChange: (filter: string) => void;
  onCategoryChange: (category: string) => void;
  onClear: () => void;
  quickCategories?: string[];
  quickVariants?: { name: string; values: string[] }[];
}

// ── ScrollRow ──

const ScrollRow = ({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);
  return (
    <div
      ref={ref}
      className={cn("flex overflow-x-auto scrollbar-none", className)}
    >
      {children}
    </div>
  );
};

// ── Component ──

export const FilterChips = ({
  products,
  filter,
  categoryFilter,
  onFilterChange,
  onCategoryChange,
  onClear,
  quickCategories: quickCategoriesProp,
  quickVariants: quickVariantsProp,
}: FilterChipsProps) => {
  // Extract unique categories. When the caller supplies complete facets
  // (vendor dashboard), use them directly; otherwise derive from the loaded
  // products as before.
  const quickCategories = useMemo(() => {
    if (quickCategoriesProp !== undefined) return quickCategoriesProp;
    if (!products) return [];
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const p of products) {
      const name = (p as any).category?.name || p.category;
      if (name && typeof name === "string" && !seen.has(name)) {
        seen.add(name);
        cats.push(name);
      }
    }
    return cats.sort();
  }, [products, quickCategoriesProp]);

  // Group variants by type when a category is selected. When the caller
  // supplies complete facets, use them directly; otherwise derive from the
  // loaded products as before.
  const quickVariants = useMemo(() => {
    if (quickVariantsProp !== undefined) return quickVariantsProp;
    if (!categoryFilter || !products) return [];
    const filtered = products.filter((p) => {
      const catName = (p as any).category?.name || p.category || "";
      return String(catName)
        .toLowerCase()
        .includes(categoryFilter.toLowerCase());
    });
    const groups: Record<string, Set<string>> = {};
    for (const p of filtered) {
      const assignments = (p as any).variantAssignments as any[] | undefined;
      if (assignments) {
        for (const a of assignments) {
          const variantName = a.option?.variant?.name;
          const optionValue = a.option?.value;
          if (variantName && optionValue) {
            if (!groups[variantName]) groups[variantName] = new Set();
            groups[variantName].add(optionValue);
          }
        }
      }
    }
    return Object.entries(groups)
      .map(([name, values]) => ({ name, values: [...values].sort() }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryFilter, products, quickVariantsProp]);

  const hasFilters = !!(categoryFilter || filter);

  return (
    <div className="space-y-2">
      {/* ── Active filters bar ── */}
      {hasFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Filtros:</span>
          {categoryFilter && (
            <Badge variant="secondary" className="gap-1 pr-1 text-xs uppercase">
              {categoryFilter}
              <button
                onClick={() => onCategoryChange("")}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filter
            .split(/\s+/)
            .filter((w) => w.length > 0)
            .map((word) => (
              <Badge
                key={word}
                variant="secondary"
                className="gap-1 pr-1 text-xs uppercase"
              >
                {word}
                <button
                  onClick={() => {
                    const words = filter
                      .split(/\s+/)
                      .filter(
                        (w) =>
                          w.length > 0 &&
                          w.toLowerCase() !== word.toLowerCase(),
                      );
                    onFilterChange(words.join(" "));
                  }}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
          >
            limpiar todo
          </button>
        </div>
      )}

      {/* ── Category chips ── */}
      {quickCategories.length > 0 && (
        <ScrollRow className="gap-2 pb-1">
          {quickCategories.map((cat) => (
            <Badge
              key={cat}
              variant={categoryFilter === cat ? "default" : "outline"}
              className="shrink-0 cursor-pointer px-3 py-1.5 text-xs font-medium whitespace-nowrap uppercase"
              onClick={() =>
                onCategoryChange(categoryFilter === cat ? "" : cat)
              }
            >
              {cat}
            </Badge>
          ))}
        </ScrollRow>
      )}

      {/* ── Variant chips grouped by type ── */}
      {quickVariants.length > 0 && (
        <div className="flex flex-col gap-2">
          {quickVariants.map((group) => (
            <div key={group.name} className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground shrink-0 w-16">
                {group.name}
              </span>
              <ScrollRow className="gap-1.5">
                {group.values.map((v) => {
                  const isActive = filter
                    .toLowerCase()
                    .includes(v.toLowerCase());
                  return (
                    <Badge
                      key={v}
                      variant={isActive ? "secondary" : "outline"}
                      className="shrink-0 cursor-pointer px-2.5 py-1 text-xs font-medium whitespace-nowrap uppercase"
                      onClick={() =>
                        onFilterChange(
                          isActive
                            ? filter
                                .replace(
                                  new RegExp(
                                    `\\s?${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                                    "i",
                                  ),
                                  "",
                                )
                                .trim()
                            : `${filter} ${v}`.trim(),
                        )
                      }
                    >
                      {v}
                    </Badge>
                  );
                })}
              </ScrollRow>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FilterChips;
