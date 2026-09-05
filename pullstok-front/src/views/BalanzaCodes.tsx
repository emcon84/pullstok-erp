import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/atoms/loader";
import { getBalanzaCodes, type BalanzaCode } from "@/services/priceKgPlan";
import type { PriceKgSpecies } from "@/services/priceKgTypes";

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

  // Dos listas separadas por especie: Perro y Gato. Los productos "AMBOS"
  // aplican a las dos (se incluyen en ambas para no perderlos de vista).
  const sections: { title: string; match: (s: PriceKgSpecies) => boolean }[] = [
    { title: "🐶 Perro", match: (s) => s === "PERRO" || s === "AMBOS" },
    { title: "🐱 Gato", match: (s) => s === "GATO" || s === "AMBOS" },
  ];

  const groupByBrand = (list: BalanzaCode[]) => {
    const byBrand = new Map<string, BalanzaCode[]>();
    for (const it of list) {
      const arr = byBrand.get(it.brand) ?? [];
      arr.push(it);
      byBrand.set(it.brand, arr);
    }
    return [...byBrand.keys()].sort((a, b) =>
      a.localeCompare(b, "es", { sensitivity: "base" }),
    );
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <div className="flex items-center justify-between">
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

      <p className="text-sm text-muted-foreground">
        Tipeá el código en la balanza (o buscá el producto por nombre) para cada
        producto suelto.
      </p>

      {/* Área imprimible: el CSS global (@media print) solo muestra .print-area */}
      <div className="print-area">
        <h1 className="mb-1 text-xl font-bold">
          Códigos de balanza — Alimento suelto
        </h1>
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader />
          </div>
        ) : (
          <div className="space-y-6">
            {items.length === 0 && (
              <p className="text-muted-foreground">No hay códigos de balanza cargados.</p>
            )}
            {sections.map((section) => {
              const sectionItems = items.filter((it) => section.match(it.species));
              if (sectionItems.length === 0) return null;
              const brands = groupByBrand(sectionItems);
              return (
                <div key={section.title} className="space-y-3">
                  <h2 className="text-lg font-bold">{section.title}</h2>
                  {brands.map((brand) => {
                    const rows = sectionItems
                      .filter((it) => it.brand === brand)
                      .sort((a, b) =>
                        a.code.localeCompare(b.code, undefined, { numeric: true }),
                      );
                    return (
                      <div key={brand}>
                        <h3 className="mb-1 rounded bg-blue-50 px-2 py-1 font-semibold">
                          {brand}
                        </h3>
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
                                  {it.type}
                                  {it.species === "AMBOS" ? " (Ambos)" : ""}
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
