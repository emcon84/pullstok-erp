import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader } from "@/components/atoms/loader";
import {
  listPriceKgTypes,
  type PriceKgType,
  type PriceKgSpecies,
} from "@/services/priceKgTypes";
import {
  listPriceKgBrands,
  type PriceKgBrand,
} from "@/services/priceKgBrands";
import { getPriceKgPlan } from "@/services/priceKgPlan";

// Mismo helper que PriceKgUpdate (copiado local, no está exportado). El
// Intl.NumberFormat con style: "currency" agrega un espacio no separable entre
// el "$" y el número, así que se arma a mano con toLocaleString.
const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Key de la matriz de celdas: misma convención que PriceKgUpdate — especie
// primero porque una marca/tipo AMBOS tiene una celda distinta por planilla.
const cellKey = (species: PriceKgSpecies, brandId: string, typeId: string) =>
  `${species}:${brandId}:${typeId}`;

/**
 * Consulta de precios por kilo (pantalla de mostrador): SOLO lectura. Buscador
 * grande que filtra marcas por nombre y muestra, por tarjeta, los precios por
 * tipo de la planilla activa (Perro/Gato). Reusa los mismos 3 GET de
 * PriceKgUpdate, accesibles a cualquier rol autenticado — no toca el backend.
 */
export const PriceKgLookup = () => {
  const [query, setQuery] = useState("");
  const [activeSpecies, setActiveSpecies] = useState<"PERRO" | "GATO">("PERRO");
  const [types, setTypes] = useState<PriceKgType[]>([]);
  const [brands, setBrands] = useState<PriceKgBrand[]>([]);
  const [cells, setCells] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // Carga inicial paralela de tipos, marcas y planilla. Cualquier error se
  // degrada a listas vacías (la pantalla sigue funcionando con datos parciales).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [typesData, brandsData, plan] = await Promise.all([
          listPriceKgTypes(),
          listPriceKgBrands(),
          getPriceKgPlan(),
        ]);
        if (cancelled) return;
        setTypes(typesData);
        setBrands(brandsData);
        const map: Record<string, string> = {};
        for (const c of plan) {
          map[cellKey(c.species, c.brandId, c.typeId)] = String(c.priceKg);
        }
        setCells(map);
      } catch {
        if (cancelled) return;
        setTypes([]);
        setBrands([]);
        setCells({});
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Marcas y tipos que aplican a la planilla activa (species === AMBOS aparece
  // en ambas). Misma regla que PriceKgUpdate.
  const visibleTypes = types.filter(
    (t) => t.species === activeSpecies || t.species === "AMBOS",
  );
  const brandsVisible = brands.filter(
    (b) => b.species === activeSpecies || b.species === "AMBOS",
  );

  // Búsqueda case-insensitive por "contiene". Con query vacío NO se listan
  // todas las marcas: en mostrador primero buscás y después ves resultados.
  const trimmed = query.trim();
  const matches = trimmed
    ? brandsVisible.filter((b) =>
        b.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios por kilo</h1>
        <p className="text-sm text-muted-foreground">
          Consultá el precio de venta por kilo de las marcas
        </p>
      </div>

      {/* Selector de especie (segmented): mismo patrón visual que PriceKgUpdate */}
      <div className="flex w-fit items-center gap-1 rounded-md border bg-muted p-1">
        <Button
          variant={activeSpecies === "PERRO" ? "default" : "ghost"}
          onClick={() => setActiveSpecies("PERRO")}
        >
          Perros
        </Button>
        <Button
          variant={activeSpecies === "GATO" ? "default" : "ghost"}
          onClick={() => setActiveSpecies("GATO")}
        >
          Gatos
        </Button>
      </div>

      {/* Buscador protagonista: input grande con lupa */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          aria-label="Buscar marca"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscá una marca... (ej. Pro Plan, Royal Canin)"
          className="h-12 pl-10 text-lg"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : trimmed === "" ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Escribí el nombre de una marca para ver sus precios por kilo.
          </p>
        </div>
      ) : matches.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-lg text-muted-foreground">
            Sin resultados para &quot;{trimmed}&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {matches.map((b) => (
            <Card key={b.id}>
              <CardContent className="pt-6">
                <h2 className="text-xl font-bold">{b.name}</h2>
                {/* Grilla de tipos visibles con su precio (o "—" si no cargó) */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleTypes.map((t) => {
                    const raw = cells[cellKey(activeSpecies, b.id, t.id)];
                    const price = raw !== undefined ? parseFloat(raw) : NaN;
                    const hasPrice =
                      raw !== undefined &&
                      raw.trim() !== "" &&
                      !Number.isNaN(price) &&
                      price > 0;
                    return (
                      <div
                        key={t.id}
                        className="rounded-lg border bg-muted/50 p-4"
                      >
                        <p className="text-sm text-muted-foreground">{t.name}</p>
                        {hasPrice ? (
                          <p className="mt-1 text-3xl font-bold tabular-nums">
                            {formatPrice(price)}
                          </p>
                        ) : (
                          <p className="mt-1 text-3xl font-bold tabular-nums text-muted-foreground">
                            —
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};