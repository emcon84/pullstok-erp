import { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Tags,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  ListTree,
  Settings2,
} from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Category,
  VariantDefinition,
  getCategories,
  createCategories,
  updateCategory,
  deleteCategory,
  getCategoryVariants,
  createVariant,

  deleteVariant,
  createVariantOption,
  updateVariantOption,
  deleteVariantOption,
} from "../services/onboardingService";
import { Loader } from "../components/atoms/loader";
import { useConfirm } from "../components/hooks/useConfirm";

interface TreeNode extends Category {
  children: TreeNode[];
  expanded: boolean;
}

const buildTree = (flat: Category[]): TreeNode[] => {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const cat of flat) {
    map.set(cat.id, { ...cat, children: [], expanded: false });
  }

  for (const cat of map.values()) {
    if (cat.parentId && map.has(cat.parentId)) {
      map.get(cat.parentId)!.children.push(cat);
    } else {
      roots.push(cat);
    }
  }

  return roots;
};

const flattenExpanded = (roots: TreeNode[]): TreeNode[] => {
  const result: TreeNode[] = [];
  for (const node of roots) {
    result.push(node);
    if (node.expanded && node.children.length > 0) {
      result.push(...flattenExpanded(node.children));
    }
  }
  return result;
};

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  parents: Category[];
  allCategories: Category[];
  onToggle: (id: string) => void;
  onEdit: (cat: TreeNode) => void;
  onDelete: (cat: TreeNode) => void;
  onAddChild: (parentId: string) => void;
  onManageVariants: (cat: TreeNode) => void;
  editing: { id: string; name: string } | null;
  editName: string;
  setEditName: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  savingEdit: boolean;
  addingUnder: string | null;
  newChildName: string;
  setNewChildName: (v: string) => void;
  onSaveChild: () => void;
  onCancelAddChild: () => void;
  addingChild: boolean;
}

const TreeNodeRow = ({
  node,
  depth,


  onToggle,
  onEdit,
  onDelete,
  onAddChild,
  onManageVariants,
  editing,
  editName,
  setEditName,
  onSaveEdit,
  onCancelEdit,
  savingEdit,
  addingUnder,
  newChildName,
  setNewChildName,
  onSaveChild,
  onCancelAddChild,
  addingChild,
}: TreeNodeRowProps) => {
  const isLeaf = (node._count?.children ?? 0) === 0;
  const childCount = node._count?.children ?? 0;
  const variantCount = node._count?.variantDefs ?? 0;
  const canExpand = childCount > 0 || (isLeaf && variantCount > 0);

  // Load variants on expand for leaf nodes
  const [loadedVariants, setLoadedVariants] = useState<VariantDefinition[]>([]);
  const [variantsLoaded, setVariantsLoaded] = useState(false);

  useEffect(() => {
    if (node.expanded && isLeaf && variantCount > 0 && !variantsLoaded) {
      getCategoryVariants(node.id)
        .then(d => { setLoadedVariants(d); setVariantsLoaded(true); })
        .catch(() => setVariantsLoaded(true));
    }
  }, [node.expanded, node.id, isLeaf, variantCount, variantsLoaded]);

  return (
    <>
      <div
        className="flex items-center gap-2 border-b px-4 py-3"
        style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}
      >
        {/* Expand toggle */}
        {canExpand ? (
          <button
            onClick={() => onToggle(node.id)}
            className="text-muted-foreground hover:text-foreground"
          >
            {node.expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {editing?.id === node.id ? (
          <>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              autoFocus
              className="h-8 flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-success hover:bg-success/10"
              onClick={onSaveEdit}
              disabled={savingEdit || !editName.trim()}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onCancelEdit}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
                <ListTree className="h-3.5 w-3.5" />
              </div>
              <span className="truncate font-medium text-sm">{node.name}</span>
              {isLeaf && variantCount > 0 && (
                <Badge variant="secondary" className="text-xs cursor-pointer" title="Click para ver variantes">
                  {variantCount} variante{variantCount !== 1 ? 's' : ''}
                  {node.expanded ? ' ▲' : ' ▼'}
                </Badge>
              )}
              {!isLeaf && childCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {childCount}
                </Badge>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onAddChild(node.id)}
              title="Agregar subcategoría"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            {isLeaf && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onManageVariants(node)}
                title="Gestionar variantes"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onEdit(node)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(node)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      {/* Variant details — show inline when leaf expanded */}
      {node.expanded && isLeaf && variantsLoaded && loadedVariants.length > 0 && (
        loadedVariants.map(def => (
          <div
            key={def.id}
            className="flex items-center gap-2 border-b bg-muted/20 py-2"
            style={{ paddingLeft: `${(depth + 1) * 1.5 + 1}rem`, paddingRight: '1rem' }}
          >
            <Tags className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground min-w-[60px]">{def.name}:</span>
            <div className="flex flex-wrap gap-1">
              {def.options?.map(opt => (
                <Badge key={opt.id} variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                  {opt.value}
                </Badge>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Inline add-child row */}
      {addingUnder === node.id && (
        <div
          className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2"
          style={{ paddingLeft: `${(depth + 1) * 1.5 + 1}rem` }}
        >
          <span className="w-4" />
          <Input
            placeholder="Nombre de la subcategoría..."
            value={newChildName}
            onChange={(e) => setNewChildName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveChild();
              if (e.key === "Escape") onCancelAddChild();
            }}
            autoFocus
            className="h-8 flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-success hover:bg-success/10"
            onClick={onSaveChild}
            disabled={addingChild || !newChildName.trim()}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCancelAddChild}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
};

export const Categories = () => {
  const [flatCategories, setFlatCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // New root category input
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Inline add child
  const [addingUnder, setAddingUnder] = useState<string | null>(null);
  const [newChildName, setNewChildName] = useState("");
  const [addingChild, setAddingChild] = useState(false);

  const confirm = useConfirm();

  // Variant management
  const [variantPanelCat, setVariantPanelCat] = useState<TreeNode | null>(null);
  const [variants, setVariants] = useState<VariantDefinition[]>([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [addingVariant, setAddingVariant] = useState(false);
  const [addingOptionFor, setAddingOptionFor] = useState<string | null>(null);
  const [newOptionValue, setNewOptionValue] = useState("");
  const [addingOption, setAddingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [savingOption, setSavingOption] = useState(false);

  const load = async () => {
    try {
      const data = await getCategories();
      setFlatCategories(data);

      // Rebuild tree preserving expanded state
      const tree = buildTree(data);
      applyExpanded(tree, expandedIds);
      setRootNodes(tree);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al cargar categorías",
      );
    } finally {
      setLoading(false);
    }
  };

  const applyExpanded = (nodes: TreeNode[], expanded: Set<string>) => {
    for (const node of nodes) {
      node.expanded = expanded.has(node.id);
      if (node.children.length > 0) applyExpanded(node.children, expanded);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    // Immediately update tree
    setRootNodes((prev) => {
      const toggle = (nodes: TreeNode[]): TreeNode[] =>
        nodes.map((n) => ({
          ...n,
          expanded: n.id === id ? !n.expanded : n.expanded,
          children: toggle(n.children),
        }));
      return toggle(prev);
    });
  };

  const handleAddRoot = async () => {
    const name = newName.trim();
    if (!name) return;
    if (flatCategories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Ya existe una categoría con ese nombre");
      return;
    }
    setAdding(true);
    try {
      await createCategories([name]);
      setNewName("");
      await load();
      toast.success("Categoría agregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al agregar");
    } finally {
      setAdding(false);
    }
  };

  const handleAddChild = (parentId: string) => {
    setAddingUnder(parentId);
    setNewChildName("");
  };

  const handleSaveChild = async () => {
    const name = newChildName.trim();
    if (!name || !addingUnder) return;
    setAddingChild(true);
    try {
      await createCategories([name], addingUnder);
      setAddingUnder(null);
      setNewChildName("");
      // Auto-expand parent
      setExpandedIds((prev) => new Set(prev).add(addingUnder));
      await load();
      toast.success("Subcategoría agregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al agregar");
    } finally {
      setAddingChild(false);
    }
  };

  const handleCancelAddChild = () => {
    setAddingUnder(null);
    setNewChildName("");
  };

  const startEdit = (cat: TreeNode) => {
    setEditId(cat.id);
    setEditName(cat.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
  };

  const handleSaveEdit = async () => {
    if (!editId) return;
    const name = editName.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      await updateCategory(editId, name);
      cancelEdit();
      await load();
      toast.success("Categoría actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al renombrar");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (cat: TreeNode) => {
    const ok = await confirm({
      title: "¿Eliminar categoría?",
      description: `Vas a eliminar "${cat.name}". ${
        (cat._count?.children ?? 0) > 0
          ? "Sus subcategorías quedarán sin padre. "
          : ""
      }Los productos que la usen quedarán sin categoría.`,
      confirmLabel: "Sí, eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteCategory(cat.id);
      await load();
      toast.success("Categoría eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    }
  };

  // --- Variant management ---

  const handleManageVariants = async (cat: TreeNode) => {
    setVariantPanelCat(cat);
    setNewVariantName("");
    setAddingOptionFor(null);
    setNewOptionValue("");
    setEditingOption(null);
    setLoadingVariants(true);
    try {
      const data = await getCategoryVariants(cat.id);
      setVariants(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cargar variantes");
    } finally {
      setLoadingVariants(false);
    }
  };

  const handleCloseVariants = () => {
    setVariantPanelCat(null);
    setVariants([]);
    load(); // Refresh categories to update variant counts
  };

  const handleAddVariant = async () => {
    const name = newVariantName.trim();
    if (!name || !variantPanelCat) return;
    setAddingVariant(true);
    try {
      await createVariant(variantPanelCat.id, { name });
      setNewVariantName("");
      const data = await getCategoryVariants(variantPanelCat.id);
      setVariants(data);
      toast.success("Variante agregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al agregar variante");
    } finally {
      setAddingVariant(false);
    }
  };

  const handleDeleteVariant = async (variantId: string, variantName: string) => {
    const ok = await confirm({
      title: "¿Eliminar variante?",
      description: `Vas a eliminar "${variantName}". Todas sus opciones y asignaciones a productos también se borrarán.`,
      confirmLabel: "Sí, eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteVariant(variantId);
      if (variantPanelCat) {
        const data = await getCategoryVariants(variantPanelCat.id);
        setVariants(data);
      }
      toast.success("Variante eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar variante");
    }
  };

  const handleAddOption = async (variantId: string) => {
    const value = newOptionValue.trim();
    if (!value) return;
    setAddingOption(true);
    try {
      await createVariantOption(variantId, { value });
      setNewOptionValue("");
      setAddingOptionFor(null);
      if (variantPanelCat) {
        const data = await getCategoryVariants(variantPanelCat.id);
        setVariants(data);
      }
      toast.success("Opción agregada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al agregar opción");
    } finally {
      setAddingOption(false);
    }
  };

  const handleStartEditOption = (optionId: string, currentValue: string) => {
    setEditingOption({ id: optionId, value: currentValue });
  };

  const handleSaveOption = async () => {
    if (!editingOption || !editingOption.value.trim()) return;
    setSavingOption(true);
    try {
      await updateVariantOption(editingOption.id, { value: editingOption.value.trim() });
      setEditingOption(null);
      if (variantPanelCat) {
        const data = await getCategoryVariants(variantPanelCat.id);
        setVariants(data);
      }
      toast.success("Opción actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al actualizar opción");
    } finally {
      setSavingOption(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    try {
      await deleteVariantOption(optionId);
      if (variantPanelCat) {
        const data = await getCategoryVariants(variantPanelCat.id);
        setVariants(data);
      }
      toast.success("Opción eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar opción");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  const visibleNodes = flattenExpanded(rootNodes);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Categorías</h1>
        <p className="text-sm text-muted-foreground">
          Organizá tus productos por categoría en forma de árbol.{" "}
          {flatCategories.length} categoría
          {flatCategories.length === 1 ? "" : "s"}.
        </p>
      </div>

      {/* Add root category */}
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Input
          placeholder="Nueva categoría raíz (ej. Limpieza, Bazar, Bebidas)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddRoot()}
          className="sm:flex-1"
        />
        <Button onClick={handleAddRoot} disabled={adding || !newName.trim()}>
          <Plus className="h-4 w-4" />
          Agregar
        </Button>
      </Card>

      {flatCategories.length === 0 ? (
        <Card className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <Tags className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Todavía no hay categorías</p>
          <p className="text-sm text-muted-foreground">
            Agregá tu primera categoría para organizar tus productos.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {visibleNodes.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={node.parentId ? getDepth(node, rootNodes) : 0}
                parents={[]}
                allCategories={flatCategories}
                onToggle={handleToggle}
                onEdit={startEdit}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
                onManageVariants={handleManageVariants}
                editing={editId ? { id: editId, name: editName } : null}
                editName={editName}
                setEditName={setEditName}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={cancelEdit}
                savingEdit={savingEdit}
                addingUnder={addingUnder}
                newChildName={newChildName}
                setNewChildName={setNewChildName}
                onSaveChild={handleSaveChild}
                onCancelAddChild={handleCancelAddChild}
                addingChild={addingChild}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Variant management dialog */}
      <Dialog
        open={variantPanelCat !== null}
        onOpenChange={(open) => {
          if (!open) handleCloseVariants();
        }}
      >
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tags className="h-5 w-5" />
              Variantes de "{variantPanelCat?.name}"
            </DialogTitle>
            <DialogDescription>
              Las variantes solo se pueden definir en categorías hoja.
              Gestioná las definiciones y sus opciones.
            </DialogDescription>
          </DialogHeader>

          {loadingVariants ? (
            <div className="flex justify-center py-8">
              <Loader />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Add new variant definition */}
              <div className="flex gap-2">
                <Input
                  placeholder="Nueva variante (ej. Talle, Color)"
                  value={newVariantName}
                  onChange={(e) => setNewVariantName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddVariant();
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={handleAddVariant}
                  disabled={addingVariant || !newVariantName.trim()}
                  size="sm"
                >
                  <Plus className="h-4 w-4" />
                  Agregar
                </Button>
              </div>

              {variants.length === 0 && !loadingVariants ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  Esta categoría no tiene variantes definidas. Agregá una para empezar.
                </p>
              ) : (
                variants.map((variant) => (
                  <Card key={variant.id} className="p-3 space-y-2">
                    {/* Variant definition header */}
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{variant.name}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDeleteVariant(variant.id, variant.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Options list */}
                    <div className="space-y-1.5">
                      {variant.options.map((opt) => (
                        <div
                          key={opt.id}
                          className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1"
                        >
                          {editingOption?.id === opt.id ? (
                            <>
                              <Input
                                value={editingOption.value}
                                onChange={(e) =>
                                  setEditingOption({
                                    id: opt.id,
                                    value: e.target.value,
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleSaveOption();
                                  if (e.key === "Escape") setEditingOption(null);
                                }}
                                autoFocus
                                className="h-7 flex-1 text-sm"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-success hover:bg-success/10"
                                onClick={handleSaveOption}
                                disabled={savingOption}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => setEditingOption(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-sm">{opt.value}</span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() =>
                                  handleStartEditOption(opt.id, opt.value)
                                }
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={() => handleDeleteOption(opt.id)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      ))}

                      {/* Inline add option */}
                      {addingOptionFor === variant.id ? (
                        <div className="flex items-center gap-2 pl-2">
                          <Input
                            placeholder="Nuevo valor (ej. Grande)"
                            value={newOptionValue}
                            onChange={(e) => setNewOptionValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleAddOption(variant.id);
                              if (e.key === "Escape") {
                                setAddingOptionFor(null);
                                setNewOptionValue("");
                              }
                            }}
                            autoFocus
                            className="h-7 flex-1 text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-success hover:bg-success/10"
                            onClick={() => handleAddOption(variant.id)}
                            disabled={addingOption || !newOptionValue.trim()}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setAddingOptionFor(null);
                              setNewOptionValue("");
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-full text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setAddingOptionFor(variant.id);
                            setNewOptionValue("");
                          }}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Agregar opción
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function getDepth(node: TreeNode, roots: TreeNode[], depth = 0): number {
  for (const root of roots) {
    if (root.id === node.id) return depth;
    if (root.children.length > 0) {
      const d = findDepth(node.id, root.children, depth + 1);
      if (d >= 0) return d;
    }
  }
  return 0;
}

function findDepth(id: string, nodes: TreeNode[], depth: number): number {
  for (const n of nodes) {
    if (n.id === id) return depth;
    if (n.children.length > 0) {
      const d = findDepth(id, n.children, depth + 1);
      if (d >= 0) return d;
    }
  }
  return -1;
}
