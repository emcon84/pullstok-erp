import { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { API_URL } from "@/constants";

interface BrandOption {
  id: string;
  value: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface PreviewData {
  affected: number;
  previousTotal: number;
  newTotal: number;
}

export const BulkPriceUpdate = () => {
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [percentage, setPercentage] = useState("");
  const [roundUp, setRoundUp] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const navigate = useNavigate();

  const headers = () => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  };

  // Load brands (Marca variant options)
  useEffect(() => {
    fetch(`${API_URL}/categories/variant-options?def=Marca`, { headers: headers() })
      .then((res) => res.json())
      .then((data: BrandOption[]) => {
        const seen = new Set<string>();
        const unique = data.filter((b) => {
          if (seen.has(b.value)) return false;
          seen.add(b.value);
          return true;
        });
        setBrands(unique.sort((a, b) => a.value.localeCompare(b.value)));
      })
      .catch(() => setBrands([]))
      .finally(() => setLoadingBrands(false));
  }, []);

  // Load categories
  useEffect(() => {
    fetch(`${API_URL}/categories`, { headers: headers() })
      .then((res) => res.json())
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const toggleBrand = (value: string) => {
    setSelectedBrands((prev) =>
      prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value]
    );
    setPreview(null);
  };

  const handlePreview = useCallback(async () => {
    if (selectedBrands.length === 0 || !percentage) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/products/bulk-price-update?dryRun=true`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          brandValues: selectedBrands,
          percentage: parseFloat(percentage),
          roundUp,
          categoryId: categoryId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreview(data);
      } else {
        toast.error(data.message || "Error al obtener preview");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSubmitting(false);
  }, [selectedBrands, percentage, roundUp, categoryId]);

  const handleApply = async () => {
    if (!preview || preview.affected === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/products/bulk-price-update`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          brandValues: selectedBrands,
          percentage: parseFloat(percentage),
          roundUp,
          categoryId: categoryId || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.affected} productos actualizados`);
        navigate("/dashboard");
      } else {
        toast.error(data.message || "Error al aplicar");
      }
    } catch {
      toast.error("Error de conexión");
    }
    setSubmitting(false);
  };

  const formatPrice = (n: number) => `$${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Actualización masiva de precios</h1>

      {/* Marcas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Marcas</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingBrands ? (
            <p className="text-sm text-muted-foreground">Cargando marcas...</p>
          ) : brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron marcas.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {brands.map((b) => (
                <Badge
                  key={b.id}
                  variant={selectedBrands.includes(b.value) ? "default" : "outline"}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => toggleBrand(b.value)}
                >
                  {b.value}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Categoría + Porcentaje + Redondeo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Configuración</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría (opcional)</Label>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPreview(null); }}>
              <SelectTrigger>
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pct">Aumento (%)</Label>
            <Input
              id="pct"
              type="number"
              step="0.5"
              min="0"
              max="500"
              placeholder="Ej: 15"
              value={percentage}
              onChange={(e) => { setPercentage(e.target.value); setPreview(null); }}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="round">Redondear hacia arriba</Label>
              <p className="text-xs text-muted-foreground">
                Si el decimal supera ,50 redondea al entero superior
              </p>
            </div>
            <Switch
              id="round"
              checked={roundUp}
              onCheckedChange={(v) => { setRoundUp(v); setPreview(null); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      <Button
        className="w-full"
        size="lg"
        disabled={selectedBrands.length === 0 || !percentage || submitting}
        onClick={handlePreview}
      >
        {submitting ? "Calculando..." : "Calcular preview"}
      </Button>

      {preview && (
        <Card className={preview.affected === 0 ? "border-amber-300" : "border-emerald-300"}>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Productos afectados</span>
              <span className="text-lg font-bold">{preview.affected}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Precio total actual</span>
              <span className="font-medium">{formatPrice(preview.previousTotal)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Precio total nuevo</span>
              <span className="font-bold text-emerald-600">{formatPrice(preview.newTotal)}</span>
            </div>

            {preview.affected > 0 && (
              <Button
                className="w-full mt-2"
                variant="default"
                disabled={submitting}
                onClick={handleApply}
              >
                {submitting ? "Aplicando..." : "Aplicar aumento"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Button variant="outline" className="w-full" onClick={() => navigate("/dashboard")}>
        Cancelar
      </Button>
    </div>
  );
};
