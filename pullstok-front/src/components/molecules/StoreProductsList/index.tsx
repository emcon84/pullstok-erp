import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useProducts } from "../../hooks/useProducts";
import {
  usePublishProduct,
  useBulkPublish,
  useStoreBrands,
} from "../../hooks/useStoreSettings";
import { API_URL } from "../../../constants";
import { Loader } from "../../atoms/loader";

const imgSrc = (image?: string) => {
  if (!image) return null;
  return image.startsWith("http")
    ? image
    : `${API_URL.replace("/api", "")}${image}`;
};

/** Lista de productos con el switch "Publicar en tienda" (WS4). Reutiliza
 * useProducts (mismo cache que el listado de Dashboard); el switch togglea
 * vía PATCH /products/:id/publish con UPDATE OPTIMISTA (el cache se actualiza
 * al instante y se revierte si el PATCH falla), y además permite publicar/
 * despublicar por MARCA de forma masiva. */
export const StoreProductsList = () => {
  const { products, loading } = useProducts();
  const { setPublished, loading: publishing } = usePublishProduct();
  const { bulkPublish, loading: bulking } = useBulkPublish();
  const { brands, loading: brandsLoading } = useStoreBrands();
  const [filter, setFilter] = useState("");
  const [brand, setBrand] = useState<string>("");

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(filter.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          placeholder="Buscar producto..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />

        <div className="flex flex-1 items-end justify-end gap-2">
          <Select value={brand} onValueChange={setBrand} disabled={brandsLoading}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Publicación masiva por marca">
              <SelectValue placeholder="Marca..." />
            </SelectTrigger>
            <SelectContent>
              {brands.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="default"
            disabled={!brand || bulking}
            onClick={() => bulkPublish({ brandValues: [brand], publishedToStore: true })}
          >
            Publicar marca
          </Button>
          <Button
            variant="outline"
            disabled={!brand || bulking}
            onClick={() => bulkPublish({ brandValues: [brand], publishedToStore: false })}
          >
            Despublicar marca
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="w-[140px] text-center">
                Publicar en tienda
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                  No hay productos.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((p) => {
              const id = (p._id || p.id) as string;
              const src = imgSrc(p.image);
              return (
                <TableRow key={id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                        {src ? (
                          <img src={src} alt={p.name} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <p className="font-medium leading-tight">{p.name}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ${Number(p.price).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={!!p.publishedToStore}
                      disabled={publishing}
                      onCheckedChange={(checked) =>
                        setPublished({ productId: id, publishedToStore: checked })
                      }
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
