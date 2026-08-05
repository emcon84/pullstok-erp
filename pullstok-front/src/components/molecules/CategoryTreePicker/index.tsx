import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, ListTree } from "lucide-react";
import { getCategories } from "@/services/onboardingService";
import { Loader } from "@/components/atoms/loader";
import { buildTree, TreeNode } from "@/components/molecules/CategoryTreePicker/tree";

interface CategoryTreePickerProps {
  value: string | null; // selected categoryId
  onChange: (categoryId: string) => void;
}

const TreePickerRow = ({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.length === 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <button
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
          isSelected ? "bg-primary/10 text-primary font-medium" : ""
        }`}
        style={{ paddingLeft: `${depth * 1.2 + 0.5}rem` }}
        onClick={() => {
          if (!isLeaf) setExpanded(!expanded);
          onSelect(node.id); // Select leaf or parent
        }}
      >
        {!isLeaf ? (
          expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ListTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{node.name}</span>
        {!isLeaf && (
          <span className="ml-auto text-xs text-muted-foreground">{node.children.length}</span>
        )}
      </button>
      {expanded && !isLeaf && (
        <div>
          {node.children.map((child) => (
            <TreePickerRow
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const CategoryTreePicker = ({ value, onChange }: CategoryTreePickerProps) => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCategories()
      .then((data) => setTree(buildTree(data)))
      .catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;

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
      <div className="max-h-[200px] overflow-y-auto rounded-md border">
        {tree.map((root) => (
          <TreePickerRow
            key={root.id}
            node={root}
            depth={0}
            selectedId={value}
            onSelect={onChange}
          />
        ))}
      </div>
    </div>
  );
};
