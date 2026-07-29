import { useEffect, useState } from "react";
import { toast } from "react-toastify";
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
import { API_URL } from "../../../../constants";
import { ProductsProps } from "../../../../models/productsModel";
import { useCreateProduct } from "../../../hooks/useProducts";
import { DataItem } from "../../../../types";
import { updateProduct } from "../../../../services/productService";
import {
  Category,
  VariantDefinition,
  getCategories,
  getCategoryVariants,
} from "../../../../services/onboardingService";
import { useQueryClient } from "@tanstack/react-query";

interface ModalEditContentProps {
  selectedData?: DataItem | null;
  setSelectedData: React.Dispatch<React.SetStateAction<DataItem | null>>;
  closeModalEdit: () => void;
}

export const ModalContent: React.FC<ModalEditContentProps> = ({
  selectedData,
  setSelectedData,
  closeModalEdit,
}) => {
  const [image, setImage] = useState<File | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [variants, setVariants] = useState<VariantDefinition[]>([]);
  const [variantSelections, setVariantSelections] = useState<
    Record<string, string>
  >({});
  const { createProduct, loading } = useCreateProduct();
  const queryClient = useQueryClient();

  const isEdit = !!(selectedData?._id || selectedData?.id);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Fetch variant definitions when category changes
  useEffect(() => {
    const catId = selectedData?.categoryId;
    if (catId) {
      getCategoryVariants(catId)
        .then((defs) => {
          setVariants(defs);
          // Pre-select existing variant assignments on edit
          if (isEdit && selectedData?.variantAssignments) {
            const preSelect: Record<string, string> = {};
            for (const pv of selectedData.variantAssignments) {
              const opt = pv.option;
              if (opt?.variantId) {
                preSelect[opt.variantId] = opt.id;
              }
            }
            setVariantSelections(preSelect);
          } else {
            setVariantSelections({});
          }
        })
        .catch(() => setVariants([]));
    } else {
      setVariants([]);
      setVariantSelections({});
    }
  }, [selectedData?.categoryId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setSelectedData((prevData: any) => {
      if (prevData) return { ...prevData, [name]: value };
      return { [name]: value } as unknown as ProductsProps;
    });
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImage(e.target.files[0]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedData) return;
    try {
      let imageUrl = selectedData.image || "";

      if (image) {
        const formData = new FormData();
        formData.append("image", image);
        const response = await fetch(`${API_URL}/image/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await response.json();
        imageUrl = data.url;
      }

      // Build variantOptionIds from selections
      const variantOptionIds = Object.values(variantSelections).filter(Boolean);

      const productData: any = {
        ...selectedData,
        image: imageUrl,
        price: parseFloat(selectedData.price?.toString() || "0"),
        quantity: parseInt(selectedData.quantity?.toString() || "0"),
        variantOptionIds,
      };

      const productId = selectedData._id || selectedData.id;
      // On edit, convert empty categoryId to null so backend can clear it
      if (productId && !selectedData.categoryId) {
        productData.categoryId = null;
      }
      if (productId) {
        await updateProduct(productData);
      } else {
        await createProduct(productData);
      }
      queryClient.invalidateQueries({ queryKey: ["products"] });

      closeModalEdit();
      toast.success(
        productId
          ? "Producto actualizado correctamente"
          : "Producto agregado correctamente",
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Ocurrió un error";
      toast.error(errorMessage);
    }
  };

  const previewSrc = selectedData?.image
    ? selectedData.image.startsWith("http")
      ? selectedData.image
      : `${API_URL.replace("/api", "")}${selectedData.image}`
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">
          {isEdit ? "Editar producto" : "Agregar producto"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Completá los datos y guardá.
        </p>
      </div>

      {previewSrc && (
        <div className="flex justify-center">
          <img
            src={previewSrc}
            alt="Producto"
            className="h-28 w-28 rounded-lg border object-cover"
          />
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Nombre</Label>
        <Input
          id="name"
          name="name"
          placeholder="Ej: Taladro inalámbrico"
          value={selectedData?.name || ""}
          onChange={handleChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="code">Código / SKU</Label>
        <Input
          id="code"
          name="code"
          placeholder="Código de barras o SKU (opcional)"
          value={selectedData?.code || ""}
          onChange={handleChange}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Input
          id="description"
          name="description"
          placeholder="Detalle del producto"
          value={selectedData?.description || ""}
          onChange={handleChange}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="categoryId">Categoría</Label>
          <Select
            value={selectedData?.categoryId || ""}
            onValueChange={(value) =>
              setSelectedData((prevData) => {
                if (prevData) return { ...prevData, categoryId: value };
                return { categoryId: value } as unknown as DataItem;
              })
            }
          >
            <SelectTrigger id="categoryId" className="w-full">
              <SelectValue placeholder="Elegí una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.parentId ? "— " : ""}
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">Cantidad</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            inputMode="numeric"
            placeholder="0"
            value={selectedData?.quantity?.toString() || ""}
            onChange={handleChange}
          />
        </div>
      </div>

      {/* Dynamic variant selectors */}
      {variants.length > 0 && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <p className="text-sm font-medium text-muted-foreground">
            Variantes de esta categoría
          </p>
          {variants.map((def) => (
            <div key={def.id} className="space-y-1.5">
              <Label className="text-xs">{def.name}</Label>
              <Select
                value={variantSelections[def.id] || ""}
                onValueChange={(value) =>
                  setVariantSelections((prev) => ({
                    ...prev,
                    [def.id]: value,
                  }))
                }
              >
                <SelectTrigger className="w-full h-9 text-sm">
                  <SelectValue
                    placeholder={`Elegí ${def.name.toLowerCase()}`}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">(Sin selección)</SelectItem>
                  {def.options.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Precio</Label>
          <Input
            id="price"
            name="price"
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={selectedData?.price?.toString() || ""}
            onChange={handleChange}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="image">Imagen</Label>
          <Input
            id="image"
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            className="cursor-pointer file:mr-2 file:text-muted-foreground"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={closeModalEdit}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </div>
  );
};
