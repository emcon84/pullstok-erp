import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, ListTree, Search } from "lucide-react";
import { getCategories } from "@/services/onboardingService";
import { Loader } from "@/components/atoms/loader";
import { Input } from "@/components/ui/input";
import { buildTree, filterTree, omitRootsByName, TreeNode } from "@/components/molecules/CategoryTreePicker/tree";

interface CategoryTreePickerProps {
  value: string | null; // selected categoryId
  onChange: (categoryId: string) => void;
  /** Nombres de categorías RAÍZ a ocultar (ej. "Carga manual" al promover). */
  excludeRootNames?: string[];
  /** Solo lectura: las filas no seleccionan (ej. producto con presentaciones). */
  disabled?: boolean;
}

const TreePickerRow = ({
  node,
  depth,
  selectedId,
  onSelect,
  forceExpanded,
  disabled,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Con búsqueda activa, cada rama filtrada arranca abierta (no hace falta
   *  clickear para llegar al match) — el toggle manual sigue funcionando. */
  forceExpanded: boolean;
  disabled?: boolean;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.length === 0;
  const isSelected = node.id === selectedId;
  const isExpanded = expanded || forceExpanded;

  return (
    <div>
      <button
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          isSelected ? "bg-primary/10 text-primary font-medium" : ""
        }`}
        style={{ paddingLeft: `${depth * 1.2 + 0.5}rem` }}
        disabled={disabled}
        onClick={() => {
          if (!isLeaf) setExpanded(!expanded);
          onSelect(node.id); // Select leaf or parent
        }}
      >
        {!isLeaf ? (
          isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
        {!isLeaf && (
          <span className="ml-auto text-xs text-muted-foreground">{node.children.length}</span>
        )}
      </button>
      {isExpanded && !isLeaf && (
        <div>
          {node.children.map((child) => (
            <TreePickerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              forceExpanded={forceExpanded}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CategoryTreePicker = ({
  value,
  onChange,
  excludeRootNames,
  disabled,
}: CategoryTreePickerProps) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  // Clave estable: evita refetchear si el llamador pasa un array nuevo por render.
  const excludeKey = excludeRootNames?.join("\u0000") ?? "";

  useEffect(() => {
    const excluded = excludeKey ? excludeKey.split("\u0000") : [];
    getCategories()
      .then((data) => setTree(omitRootsByName(buildTree(data), excluded)))
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [excludeKey]);

  if (loading) return <Loader />;

  const searchActive = query.trim().length > 0;
  const visibleTree = filterTree(tree, query);

  // Find selected category name for breadcrumb
  const findName = (nodes: TreeNode[], id: string): string | null => {
    for (const n of nodes) {
      if (n.id === id) return n.name;
      const found = findName(n.children, id);
      if (found) return found;
    }
    return null;
  };
  const selectedName = value ? findName(tree, value) : null;

  return (
    <div className="space-y-1">
      {selectedName && (
        <div className="rounded-md bg-primary/5 px-3 py-1.5 text-sm">
          📁 {selectedName}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar categoría…"
          className="h-8 pl-7 text-sm"
        />
      </div>
      <div className="max-h-[200px] overflow-y-auto rounded-md border">
        {visibleTree.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            Sin resultados para "{query.trim()}"
          </p>
        ) : (
          visibleTree.map((root) => (
            <TreePickerRow
              key={root.id}
              node={root}
              depth={0}
              selectedId={value}
              onSelect={onChange}
              forceExpanded={searchActive}
              disabled={disabled}
            />
          ))
        )}
      </div>
    </div>
  );
};
