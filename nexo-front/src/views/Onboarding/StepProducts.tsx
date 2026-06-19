import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Plus } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductCsvUploadForm } from "../../components/molecules/ProductCsvUploadForm";
import { createProduct } from "../../services/productService";
import {
  Category,
  completeOnboarding,
  getCategories,
} from "../../services/onboardingService";

interface StepProductsProps {
  onBack: () => void;
}

export const StepProducts = ({ onBack }: StepProductsProps) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCount, setProductCount] = useState(0);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) {
      setAddError("Elegí una categoría");
      return;
    }
    setAddingProduct(true);
    setAddError(null);
    try {
      await createProduct({
        name,
        price: parseFloat(price || "0"),
        quantity: parseInt(quantity || "0", 10),
        categoryId,
      });
      setProductCount((prev) => prev + 1);
      setName("");
      setPrice("");
      setQuantity("");
      setCategoryId("");
      toast.success("Producto agregado");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setAddingProduct(false);
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await completeOnboarding();
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate("/dashboard");
    } catch (err) {
      setFinishError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cargá tus productos</CardTitle>
          <CardDescription>
            Importá un CSV o agregalos uno por uno. Podés agregar más
            productos después del onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ProductCsvUploadForm
            onSuccess={() => setProductCount((prev) => prev + 1)}
          />

          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Alta manual</p>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="product-name">Nombre</Label>
                <Input
                  id="product-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Taladro inalámbrico"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="product-price">Precio</Label>
                  <Input
                    id="product-price"
                    type="number"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="product-quantity">Cantidad</Label>
                  <Input
                    id="product-quantity"
                    type="number"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-category">Categoría</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="product-category" className="w-full">
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

              {addError && (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {addError}
                </p>
              )}

              <div className="flex justify-end">
                <Button type="submit" variant="outline" disabled={addingProduct}>
                  {addingProduct ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Agregar producto
                </Button>
              </div>
            </form>
          </div>

          {productCount > 0 && (
            <p className="text-sm text-muted-foreground">
              {productCount} producto(s) cargado(s) en esta sesión.
            </p>
          )}
        </CardContent>
      </Card>

      {finishError && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {finishError}
        </p>
      )}

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          Atrás
        </Button>
        <Button type="button" onClick={handleFinish} disabled={finishing}>
          {finishing && <Loader2 className="animate-spin" />}
          {finishing ? "Finalizando..." : "Finalizar"}
        </Button>
      </div>
    </div>
  );
};
