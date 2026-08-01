import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryTreePicker } from "@/components/molecules/CategoryTreePicker";
import { useCreateProduct } from "@/components/hooks/useProducts";
import { useProductStock } from "@/components/hooks/useProductStock";
import { useQueryClient } from "@tanstack/react-query";
import {
  VariantDefinition,
  getCategoryVariants,
} from "@/services/onboardingService";
import { updateProduct } from "@/services/productService";
import type { BranchStockInfo } from "@/services/productService";
import { canEditBranchStock } from "@/constants/rolePermissions";
import type { Role } from "@/constants/rolePermissions";
import { API_URL } from "@/constants";
import type { DataItem } from "@/types";

interface ProductDrawerProps {
  open: boolean;
  onClose: () => void;
  product?: DataItem | null; // null/undefined = create mode
  onCreated?: (product: DataItem) => void;
}

/** Body sent to create/update product. quantity is only present in create
 * mode (server syncs HQ stock); edit mode edits stock per branch. */
interface ProductPayload {
  name: string;
  code?: string;
  description?: string;
  price: number;
  image?: string;
  variantOptionIds: string[];
  quantity?: number;
  categoryId?: string | null;
}

export const ProductDrawer = ({ open, onClose, product, onCreated }: ProductDrawerProps) => {
  const isEdit = !!(product?._id || product?.id);
  const queryClient = useQueryClient();
  const { createProduct, loading } = useCreateProduct();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [variants, setVariants] = useState<VariantDefinition[]>([]);
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  // Draft per-branch quantities + which branch is saving right now (edit mode).
  const [branchDrafts, setBranchDrafts] = useState<Record<string, string>>({});
  const [savingBranch, setSavingBranch] = useState<string | null>(null);

  // Stock por sucursal (edit mode): self-contained response, no GET /branches.
  const productId = isEdit ? (product?._id || product?.id) : undefined;
  const { stock, loading: stockLoading, updateBranchStock: saveBranchStock } =
    useProductStock(productId);

  // Client-side stock-edit policy (mirrors the backend): the response's
  // `canEdit` is authoritative; the helper is the UI expression of the same rule.
  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  })();
  const userRole = currentUser?.role as Role | undefined;
  const userBranchIds = currentUser?.branchIds as string[] | undefined;

  const canEditBranch = (branch: BranchStockInfo): boolean =>
    branch.canEdit &&
    canEditBranchStock(userRole, userBranchIds, branch.branchId);

  // Keep per-branch drafts in sync with the latest server response.
  useEffect(() => {
    if (stock) {
      const drafts: Record<string, string> = {};
      for (const branch of stock.branches) {
        drafts[branch.branchId] = String(branch.quantity);
      }
      setBranchDrafts(drafts);
    }
  }, [stock]);

  const handleSaveBranchStock = async (branchId: string) => {
    const quantity = parseInt(branchDrafts[branchId] ?? "0", 10);
    if (Number.isNaN(quantity) || quantity < 0) {
      toast.error("La cantidad debe ser un número mayor o igual a 0");
      return;
    }
    setSavingBranch(branchId);
    try {
      await saveBranchStock({ branchId, quantity });
      toast.success("Stock actualizado");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Error al actualizar el stock";
      toast.error(message);
    } finally {
      setSavingBranch(null);
    }
  };

  // Reset form on open/product change
  useEffect(() => {
    if (open) {
      if (product) {
        // Pre-fill for both edit and duplicate mode
        setName(product.name || "");
        setCode(product.code || "");
        setDescription(product.description || "");
        setCategoryId(product.categoryId || "");
        setPrice(product.price?.toString() || "");
        setQuantity(product.quantity?.toString() || "");
        setImageUrl(product.image || "");
        setImageFile(null);
        // Pre-select variants if available
        if (product.variantAssignments) {
          const pre: Record<string, string> = {};
          for (const pv of product.variantAssignments) {
            if (pv.option?.variantId) pre[pv.option.variantId] = pv.option.id;
          }
          setVariantSelections(pre);
        } else {
          setVariantSelections({});
        }
      } else {
        setName("");
        setCode("");
        setDescription("");
        setCategoryId("");
        setPrice("");
        setQuantity("");
        setImageUrl("");
        setImageFile(null);
        setVariants([]);
        setVariantSelections({});
      }
    }
  }, [open, product, isEdit]);

  // Load variants when category changes
  useEffect(() => {
    if (categoryId) {
      getCategoryVariants(categoryId)
        .then((defs) => {
          setVariants(defs);
          // Only clear selections for fresh create (no product data at all)
          if (!isEdit && !product?.variantAssignments) setVariantSelections({});
        })
        .catch(() => setVariants([]));
    } else {
      setVariants([]);
      setVariantSelections({});
    }
  }, [categoryId, isEdit, product?.variantAssignments]);

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error("El nombre es requerido"); return; }
    setSaving(true);
    try {
      let imgUrl = imageUrl;
      if (imageFile) {
        const fd = new FormData();
        fd.append("image", imageFile);
        const res = await fetch(`${API_URL}/image/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
          body: fd,
        });
        const data = await res.json();
        imgUrl = data.url;
      }

      const variantOptionIds = Object.values(variantSelections).filter(Boolean);
      const payload: ProductPayload = {
        name,
        code: code || undefined,
        description: description || undefined,
        price: parseFloat(price) || 0,
        image: imgUrl,
        variantOptionIds,
      };
      // Only create mode sends the global quantity: the server syncs it to the
      // HQ ProductStock row (syncHqStock). In edit mode stock is edited per
      // branch via the stock endpoints, so Product.quantity must not change.
      if (!isEdit) {
        payload.quantity = parseInt(quantity) || 0;
      }

      if (isEdit && product) {
        payload.categoryId = categoryId || null;
        await updateProduct({ _id: product._id || product.id, ...payload } as DataItem);
        toast.success("Producto actualizado");
      } else {
        payload.categoryId = categoryId || undefined;
        const newProduct = await createProduct(payload as DataItem);
        toast.success("Producto creado");
        onCreated?.(newProduct);
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error al guardar";
      toast.error(message);
    }
    setSaving(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[440px] sm:max-w-[440px] max-w-[100vw] overflow-hidden p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-2 shrink-0">
          <SheetTitle>{isEdit ? "Editar producto" : "Agregar producto"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-8 overflow-y-auto flex-1 min-h-0">
          {/* Nombre + Código */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-name">Nombre *</Label>
              <Input id="p-name" value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Collar de Cuero" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-code">Código / SKU</Label>
              <Input id="p-code" value={code} onChange={e => setCode(e.target.value)} placeholder="Código de barras" />
            </div>
          </div>

          {/* Categoría — tree picker */}
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <CategoryTreePicker value={categoryId} onChange={setCategoryId} />
          </div>

          {/* Precio + Cantidad (Cantidad solo en alta; en edición el stock es por sucursal) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className={`space-y-1.5 ${isEdit ? "sm:col-span-2" : ""}`}>
              <Label htmlFor="p-price">Precio</Label>
              <Input id="p-price" type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
            {!isEdit && (
              <div className="space-y-1.5">
                <Label htmlFor="p-qty">Cantidad</Label>
                <Input id="p-qty" type="number" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
              </div>
            )}
          </div>

          {/* Stock por sucursal — edit mode (spec F1): una card por sucursal activa,
              con edición inline SOLO donde el usuario puede editar (canEdit). */}
          {isEdit && (
            <div className="space-y-2">
              <Label>Stock por sucursal</Label>
              {stockLoading && (
                <p className="text-sm text-muted-foreground">Cargando stock...</p>
              )}
              {!stockLoading && !stock && (
                <p className="text-sm text-muted-foreground">No se pudo cargar el stock de las sucursales</p>
              )}
              {stock?.branches.map((branch) => (
                <Card key={branch.branchId} className="py-3">
                  <CardContent className="flex items-center justify-between gap-3 px-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{branch.branchName}</p>
                      <p className="text-xs text-muted-foreground">
                        {branch.quantity} en stock{branch.isHeadquarters ? " · Casa central" : ""}
                      </p>
                    </div>
                    {canEditBranch(branch) ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <Input
                          type="number"
                          inputMode="numeric"
                          aria-label={`Cantidad de ${branch.branchName}`}
                          className="w-20"
                          value={branchDrafts[branch.branchId] ?? String(branch.quantity)}
                          onChange={e => setBranchDrafts(prev => ({ ...prev, [branch.branchId]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSaveBranchStock(branch.branchId)}
                          disabled={savingBranch === branch.branchId}
                        >
                          {savingBranch === branch.branchId ? "Guardando..." : "Guardar"}
                        </Button>
                      </div>
                    ) : (
                      <span className="shrink-0 text-sm text-muted-foreground">Solo lectura</span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Descripción */}
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Descripción</Label>
            <Input id="p-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalle del producto" />
          </div>

          {/* Imagen */}
          <div className="space-y-1.5">
            <Label>Imagen</Label>
            <div className="flex items-center gap-3">
              {(imageUrl || product?.image) && (
                <img src={imageUrl || product?.image} alt="" className="h-14 w-14 rounded-md border object-cover" />
              )}
              <Input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} className="flex-1" />
            </div>
          </div>

          {/* Variants */}
          {variants.length > 0 && (
            <div className="space-y-3 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <p className="text-sm font-semibold text-primary">Variantes</p>
              {variants.map((def) => (
                <div key={def.id} className="space-y-1">
                  <Label className="text-xs">{def.name}</Label>
                  <Select
                    value={variantSelections[def.id] || ""}
                    onValueChange={(v) => setVariantSelections(prev => ({ ...prev, [def.id]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Elegí ${def.name.toLowerCase()}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">—</SelectItem>
                      {def.options.map((opt) => (
                        <SelectItem key={opt.id} value={opt.id}>{opt.value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={saving || loading}>
              {saving ? "Guardando..." : isEdit ? "Actualizar" : "Crear producto"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
