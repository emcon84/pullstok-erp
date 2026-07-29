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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CategoryTreePicker } from "@/components/molecules/CategoryTreePicker";
import { useCreateProduct } from "@/components/hooks/useProducts";
import { useQueryClient } from "@tanstack/react-query";
import {
  VariantDefinition,
  getCategoryVariants,
  updateProduct,
} from "@/services/onboardingService";
import { API_URL } from "@/constants";
import type { DataItem } from "@/types";

interface ProductDrawerProps {
  open: boolean;
  onClose: () => void;
  product?: DataItem | null; // null/undefined = create mode
}

export const ProductDrawer = ({ open, onClose, product }: ProductDrawerProps) => {
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

  // Reset form on open/product change
  useEffect(() => {
    if (open) {
      if (product && isEdit) {
        setName(product.name || "");
        setCode(product.code || "");
        setDescription(product.description || "");
        setCategoryId(product.categoryId || "");
        setPrice(product.price?.toString() || "");
        setQuantity(product.quantity?.toString() || "");
        setImageUrl(product.image || "");
        setImageFile(null);
        // Pre-select variants
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
          if (!isEdit) setVariantSelections({});
        })
        .catch(() => setVariants([]));
    } else {
      setVariants([]);
      setVariantSelections({});
    }
  }, [categoryId, isEdit]);

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
      const payload: any = {
        name,
        code: code || undefined,
        description: description || undefined,
        price: parseFloat(price) || 0,
        quantity: parseInt(quantity) || 0,
        image: imgUrl,
        variantOptionIds,
      };

      if (isEdit && product) {
        payload.categoryId = categoryId || null;
        await updateProduct({ _id: product._id || product.id, ...payload });
        toast.success("Producto actualizado");
      } else {
        payload.categoryId = categoryId || undefined;
        await createProduct(payload);
        toast.success("Producto creado");
      }

      queryClient.invalidateQueries({ queryKey: ["products"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "Error al guardar");
    }
    setSaving(false);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[440px] sm:max-w-[440px] overflow-y-auto p-0">
        <SheetHeader className="px-6 pt-6 pb-2">
          <SheetTitle>{isEdit ? "Editar producto" : "Agregar producto"}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-6 pb-8">
          {/* Nombre + Código */}
          <div className="grid grid-cols-2 gap-3">
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

          {/* Precio + Cantidad */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-price">Precio</Label>
              <Input id="p-price" type="number" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-qty">Cantidad</Label>
              <Input id="p-qty" type="number" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" />
            </div>
          </div>

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
