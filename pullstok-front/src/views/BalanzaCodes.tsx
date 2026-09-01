import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/atoms/loader";
import { getBalanzaCodes, type BalanzaCode } from "@/services/priceKgPlan";

/**
 * Listado imprimible de códigos de balanza (celdas sueltas con scaleCode),
 * agrupado por marca. Para que los vendedores lo tengan a mano e impriman
 * desde el sistema (Ctrl+P / botón Imprimir).
 */
export const BalanzaCodes = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<BalanzaCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBalanzaCodes()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const byBrand = new Map<string, BalanzaCode[]>();
  for (const it of items) {
    const arr = byBrand.get(it.brand) ?? [];
    arr.push(it);
    byBrand.set(it.brand, arr);
  }
  const brands = [...byBrand.keys()].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6 print:p-0">
      <div className="no-print flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Volver">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Códigos de balanza
          </h1>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <p className="no-print text-sm text-muted-foreground">
        Tipeá el código en la balanza (o buscá el producto por nombre) para cada
        producto suelto.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader />
        </div>
      ) : (
        <div className="space-y-5">
          {brands.length === 0 && (
            <p className="text-muted-foreground">No hay códigos de balanza cargados.</p>
          )}
          {brands.map((brand) => {
            const rows = (byBrand.get(brand) ?? [])
              .slice()
              .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
            return (
              <div key={brand}>
                <h2 className="mb-1 rounded bg-blue-50 px-2 py-1 font-semibold">
                  {brand}
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground">Código</th>
                      <th className="text-left font-medium text-muted-foreground">Producto</th>
                      <th className="text-right font-medium text-muted-foreground">Precio/kg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => (
                      <tr key={it.code} className="border-b">
                        <td className="py-1 pr-2 font-mono font-bold">{it.code}</td>
                        <td>
                          {it.brand} {it.type} {it.species}
                        </td>
                        <td className="py-1 text-right whitespace-nowrap">
                          ${it.priceKg.toLocaleString("es-AR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
    </div>
  );
};
