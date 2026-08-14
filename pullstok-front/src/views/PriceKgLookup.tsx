import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

// Mismo helper que PriceKgUpdate (copiado local, no está exportado). Los
// precios sueltos SIEMPRE son redondos (decisión del usuario): sin decimales.
const formatPrice = (n: number) =>
  `$${n.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

// Key de la matriz de celdas: misma convención que PriceKgUpdate — especie
// primero porque una marca/tipo AMBOS tiene una celda distinta por planilla.
const cellKey = (species: PriceKgSpecies, brandId: string, typeId: string) =>
  `${species}:${brandId}:${typeId}`;

// Precio de una celda concreta (species, marca, tipo): string si existe, o
// undefined si nunca se cargó. No parsea acá — el render decide.
const cellPrice = (
  cells: Record<string, string>,
  species: PriceKgSpecies,
  brandId: string,
  typeId: string,
): string | undefined => {
  const raw = cells[cellKey(species, brandId, typeId)];
  if (raw === undefined || raw.trim() === "") return undefined;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return formatPrice(n);
};

/**
 * Consulta de precios por kilo (pantalla de mostrador): SOLO lectura. Buscador
 * grande que filtra marcas por nombre y muestra, por tarjeta, los precios por
 * tipo con AMBAS especies juntas cuando aplican: cada tipo declara su especie
 * (PERRO | GATO | AMBOS) y muestra un precio etiquetado por especie. Reusa los
 * mismos 3 GET de PriceKgUpdate, accesibles a cualquier rol autenticado — no
 * toca el backend.
 */
export const PriceKgLookup = () => {
  const [query, setQuery] = useState("");
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

  // Búsqueda case-insensitive por "contiene" sobre TODAS las marcas (sin
  // filtrar por especie: con "ver ambos a la vez" no hay planilla activa). Con
  // query vacío NO se listan todas las marcas: en mostrador primero buscás y
  // después ves resultados.
  const trimmed = query.trim();
  const matches = trimmed
    ? brands.filter((b) =>
        b.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : [];

  // Los tipos se muestran TODOS, cada uno con las especies que le aplican.
  const showPerro = (t: PriceKgType) => t.species !== "GATO";
  const showGato = (t: PriceKgType) => t.species !== "PERRO";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Precios por kilo</h1>
        <p className="text-sm text-muted-foreground">
          Consultá el precio de venta por kilo de las marcas
        </p>
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
                {/* Grilla de tipos con un precio etiquetado por especie */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {types.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg border bg-muted/50 p-4"
                    >
                      <p className="text-sm text-muted-foreground">{t.name}</p>
                      <div className="mt-2 space-y-2">
                        {showPerro(t) && (
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline">Perro</Badge>
                            <span className="text-3xl font-bold tabular-nums">
                              {cellPrice(cells, "PERRO", b.id, t.id) ?? "—"}
                            </span>
                          </div>
                        )}
                        {showGato(t) && (
                          <div className="flex items-center justify-between gap-2">
                            <Badge variant="outline">Gato</Badge>
                            <span className="text-3xl font-bold tabular-nums">
                              {cellPrice(cells, "GATO", b.id, t.id) ?? "—"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};