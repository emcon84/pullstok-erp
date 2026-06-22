import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Industry,
  createCategories,
  getSuggestedCategories,
} from "../../services/onboardingService";

interface StepCategoriesProps {
  industry: Industry;
  onBack: () => void;
  onNext: () => void;
}

export const StepCategories = ({
  industry,
  onBack,
  onNext,
}: StepCategoriesProps) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingSuggested(true);
    getSuggestedCategories(industry)
      .then((suggested) => {
        if (active) setCategories(suggested);
      })
      .catch(() => {
        if (active) setCategories([]);
      })
      .finally(() => {
        if (active) setLoadingSuggested(false);
      });
    return () => {
      active = false;
    };
  }, [industry]);

  const addCategory = () => {
    const name = newCategory.trim();
    if (!name || categories.includes(name)) return;
    setCategories((prev) => [...prev, name]);
    setNewCategory("");
  };

  const removeCategory = (name: string) => {
    setCategories((prev) => prev.filter((c) => c !== name));
  };

  const handleSubmit = async () => {
    if (categories.length === 0) {
      setError("Agregá al menos una categoría para continuar");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createCategories(categories);
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Categorías de producto</CardTitle>
        <CardDescription>
          Te sugerimos algunas según tu rubro. Agregá, quitá o editá las que
          necesites.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingSuggested ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <li
                key={cat}
                className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
              >
                {cat}
                <button
                  type="button"
                  onClick={() => removeCategory(cat)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Quitar ${cat}`}
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
            {categories.length === 0 && (
              <li className="text-sm text-muted-foreground">
                Todavía no agregaste ninguna categoría.
              </li>
            )}
          </ul>
        )}

        <div className="flex gap-2">
          <Input
            placeholder="Nueva categoría"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addCategory}>
            <Plus className="size-4" />
            Agregar
          </Button>
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-between pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            Atrás
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="animate-spin" />}
            {loading ? "Guardando..." : "Continuar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
