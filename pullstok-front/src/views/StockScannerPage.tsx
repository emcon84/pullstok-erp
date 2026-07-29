import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const StockScannerPage = () => {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem("token") || "";

  const lookup = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/products/by-code/${encodeURIComponent(code.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "No encontrado"); setResult(null); }
      else { setResult(data); setError(""); }
    } catch {
      setError("Error de conexión");
    }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-md space-y-4 p-4">
      <h1 className="text-xl font-bold">Escanear producto</h1>

      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Código de barras o SKU"
            value={code}
            onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && lookup()}
            autoFocus
          />
          <Button onClick={lookup} disabled={loading}>
            {loading ? "..." : "Buscar"}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {result && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <p className="font-semibold">{result.name}</p>
            <p className="text-sm text-muted-foreground">Código: {result.code || "—"}</p>
            <p className="text-sm text-muted-foreground">Categoría: {result.category?.name || "—"}</p>
            <div className="flex items-center gap-2">
              <span className="text-sm">Stock:</span>
              <span className={`text-xl font-bold ${result.quantity <= 0 ? "text-destructive" : ""}`}>
                {result.quantity}
              </span>
            </div>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Próximamente: escaneo con cámara
      </p>
    </div>
  );
};
