import { useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Industry, updateOrganization } from "../../services/onboardingService";

const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: "FERRETERIA", label: "Ferretería" },
  { value: "KIOSCO", label: "Kiosco" },
  { value: "INDUMENTARIA", label: "Indumentaria" },
  { value: "ALMACEN", label: "Almacén" },
  { value: "OTHER", label: "Otro" },
];

interface StepBusinessProps {
  onNext: (industry: Industry) => void;
}

export const StepBusiness = ({ onNext }: StepBusinessProps) => {
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [taxId, setTaxId] = useState("");
  const [industry, setIndustry] = useState<Industry | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!industry) {
      setError("Elegí un rubro para continuar");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await updateOrganization({ address, phone, taxId, industry });
      onNext(industry);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Datos del negocio</CardTitle>
        <CardDescription>
          Esta información aparece en tus comprobantes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Dirección</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Ej: Av. Siempreviva 742"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ej: 11-1234-5678"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">CUIT</Label>
              <Input
                id="taxId"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                placeholder="Ej: 20-12345678-9"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="industry">Rubro</Label>
            <Select
              value={industry}
              onValueChange={(value) => setIndustry(value as Industry)}
            >
              <SelectTrigger id="industry" className="w-full">
                <SelectValue placeholder="Elegí tu rubro" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {loading ? "Guardando..." : "Continuar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
