import { useEffect, useState } from "react";
import { ChevronRight, ChevronDown, ListTree } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { getCategories } from "@/services/onboardingService";
import { Loader } from "@/components/atoms/loader";
import { buildTree, TreeNode } from "@/components/molecules/CategoryTreePicker/tree";

type CheckState = "checked" | "indeterminate" | "unchecked";

/** Ids del nodo + todo su subtree (el checkbox de un padre cubre descendientes). */
const collectIds = (node: TreeNode): string[] => [
  node.id,
  ...node.children.flatMap(collectIds),
];

const computeState = (
  node: TreeNode,
  selected: ReadonlySet<string>,
): CheckState => {
  const ids = collectIds(node);
  const checkedCount = ids.reduce(
    (n, id) => n + (selected.has(id) ? 1 : 0),
    0,
  );
  if (checkedCount === ids.length) return "checked";
  if (checkedCount > 0) return "indeterminate";
  return "unchecked";
};

interface CategoryTreePickerMultiProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

const TreeRow = ({
  node,
  depth,
  selected,
  onToggle,
  expanded,
  onExpand,
}: {
  node: TreeNode;
  depth: number;
  selected: ReadonlySet<string>;
  onToggle: (node: TreeNode) => void;
  expanded: ReadonlySet<string>;
  onExpand: (id: string) => void;
}) => {
  const state = computeState(node, selected);
  const isLeaf = node.children.length === 0;
  const isExpanded = expanded.has(node.id);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded-md px-1 py-1 hover:bg-accent/50"
        style={{ paddingLeft: `${depth * 1.1 + 0.25}rem` }}
      >
        {isLeaf ? (
          <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <button
            type="button"
            aria-label={
              isExpanded ? `Contraer ${node.name}` : `Expandir ${node.name}`
            }
            onClick={() => onExpand(node.id)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        )}
        <div className="flex min-w-0 cursor-pointer items-center gap-2">
          <Checkbox
            checked={
              state === "indeterminate" ? "indeterminate" : state === "checked"
            }
            onCheckedChange={() => onToggle(node)}
            aria-label={node.name}
          />
          <span className="truncate text-sm">{node.name}</span>
        </div>
      </div>

      {isExpanded && !isLeaf && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
              expanded={expanded}
              onExpand={onExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Multi-select de árbol de categorías con comportamiento por subtree: tildar un
 * padre incluye TODOS sus descendientes; destildarlo los quita. Tri-state por
 * nodo (checked / indeterminate / unchecked). Componente CONTROLADO: el estado
 * vive en el padre vía `selected` + `onChange(ids)`. Reusa `buildTree` de
 * CategoryTreePicker/tree.ts.
 */
export const CategoryTreePickerMulti = ({
  selected,
  onChange,
}: CategoryTreePickerMultiProps) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    getCategories()
      .then((data) => setTree(buildTree(data)))
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

  const selectedSet = new Set(selected);

  const toggleNode = (node: TreeNode) => {
    const ids = collectIds(node);
    const next = new Set(selectedSet);
    if (computeState(node, selectedSet) === "checked") {
      ids.forEach((id) => next.delete(id));
    } else {
      // unchecked O indeterminate → chequea todo el subtree (idempotente).
      ids.forEach((id) => next.add(id));
    }
    onChange([...next].sort());
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="max-h-[260px] space-y-0.5 overflow-y-auto rounded-md border p-1">
      {tree.map((root) => (
        <TreeRow
          key={root.id}
          node={root}
          depth={0}
          selected={selectedSet}
          onToggle={toggleNode}
          expanded={expanded}
          onExpand={toggleExpand}
        />
      ))}
    </div>
  );
};