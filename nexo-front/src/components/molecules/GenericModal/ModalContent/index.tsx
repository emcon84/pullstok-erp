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
import { Category, getCategories } from "../../../../services/onboardingService";
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
  const { createProduct, loading } = useCreateProduct();
  const queryClient = useQueryClient();

  const isEdit = !!(selectedData?._id || selectedData?.id);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

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

      const productData = {
        ...selectedData,
        image: imageUrl,
        price: parseFloat(selectedData.price?.toString() || "0"),
        quantity: parseInt(selectedData.quantity?.toString() || "0"),
      };

      const productId = selectedData._id || selectedData.id;
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
