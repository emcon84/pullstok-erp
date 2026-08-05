import { Category } from "@/services/onboardingService";

/** Nodo del árbol de categorías construido desde la lista plana. */
export interface TreeNode extends Category {
  children: TreeNode[];
}

/**
 * Construye el árbol desde la lista plana de categorías (getCategories).
 * Los nodos cuyo parentId no existe en la lista caen como raíces (categorías
 * huérfanas se mantienen visibles). Compartido entre CategoryTreePicker
 * (single-select) y CategoryTreePickerMulti (multi-select).
 */
export const buildTree = (flat: Category[]): TreeNode[] => {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [] });
  }
  for (const cat of flat) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
};
