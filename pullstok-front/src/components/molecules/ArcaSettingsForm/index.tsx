import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getArcaSettings,
  updateArcaSettings,
  type ArcaEnvironment,
} from "../../../services/arcaService";
import { Loader } from "@/components/atoms/loader";

/**
 * Form de configuración ARCA del emisor (deuda técnica item 6).
 * Antes la config ARCA (CUIT, punto de venta, ambiente, rutas de cert) solo
 * se podía setear por API; este form la expone en Ajustes para el ADMIN.
 *
 * Los certificados NUNCA se suben acá: solo se cargan las RUTAS (certPath/
 * keyPath) donde viven en el VPS. El campo enabled habilita el gate de
 * emisión fiscal.
 */
const toField = (value: string | null | undefined) => value ?? "";

export const ArcaSettingsForm = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["arca-settings"],
    queryFn: getArcaSettings,
    staleTime: Infinity,
  });

  const [form, setForm] = useState({
    cuitEmisor: "",
    padronCuit: "",
    puntoVenta: "",
    environment: "HOMOLOGACION" as ArcaEnvironment,
    certPath: "",
    keyPath: "",
    enabled: false,
  });

  useEffect(() => {
    if (data) {
      setForm({
        cuitEmisor: toField(data.cuitEmisor),
        padronCuit: toField(data.padronCuit),
        puntoVenta: data.puntoVenta != null ? String(data.puntoVenta) : "",
        environment: data.environment,
        certPath: toField(data.certPath),
        keyPath: toField(data.keyPath),
        enabled: data.enabled,
      });
    }
  }, [data]);

  const mutation = useMutation({
    mutationFn: updateArcaSettings,
    onSuccess: () => {
      toast.success("Configuración ARCA guardada");
      queryClient.invalidateQueries({ queryKey: ["arca-settings"] });
      queryClient.invalidateQueries({ queryKey: ["arca-check-enabled"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error al guardar la configuración ARCA");
    },
  });

  const handleField = (key: keyof typeof form, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    mutation.mutate({
      cuitEmisor: form.cuitEmisor.trim(),
      padronCuit: form.padronCuit.trim() || undefined,
      puntoVenta: form.puntoVenta.trim() ? Number(form.puntoVenta) : undefined,
      environment: form.environment,
      certPath: form.certPath.trim(),
      keyPath: form.keyPath.trim(),
      enabled: form.enabled,
    });
  };

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardContent className="flex items-center justify-center py-8">
          <Loader />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Integración ARCA</CardTitle>
        <CardDescription>
          Configurá la facturación electrónica: CUIT del emisor, punto de
          venta y las rutas de los certificados en el servidor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="arcaCuitEmisor">CUIT del emisor</Label>
          <Input
            id="arcaCuitEmisor"
            value={form.cuitEmisor}
            onChange={(e) => handleField("cuitEmisor", e.target.value)}
            placeholder="20-12345678-9"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="arcaPuntoVenta">Punto de venta</Label>
            <Input
              id="arcaPuntoVenta"
              type="number"
              min={1}
              max={9999}
              value={form.puntoVenta}
              onChange={(e) => handleField("puntoVenta", e.target.value)}
              placeholder="Ej. 0002"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="arcaEnvironment">Ambiente</Label>
            <select
              id="arcaEnvironment"
              value={form.environment}
              onChange={(e) =>
                handleField("environment", e.target.value as ArcaEnvironment)
              }
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="HOMOLOGACION">Homologación</option>
              <option value="PRODUCCION">Producción</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="arcaPadronCuit">CUIT del padrón (autocompletar clientes)</Label>
          <Input
            id="arcaPadronCuit"
            value={form.padronCuit}
            onChange={(e) => handleField("padronCuit", e.target.value)}
            placeholder="Opcional; si se omite usa el del emisor"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="arcaCertPath">Ruta del certificado (.crt)</Label>
          <Input
            id="arcaCertPath"
            value={form.certPath}
            onChange={(e) => handleField("certPath", e.target.value)}
            placeholder="/var/www/pullstok/certs/{org}/wswfev1-HOMOLOGACION.crt"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="arcaKeyPath">Ruta de la clave (.key)</Label>
          <Input
            id="arcaKeyPath"
            value={form.keyPath}
            onChange={(e) => handleField("keyPath", e.target.value)}
            placeholder="/var/www/pullstok/certs/{org}/wswfev1-HOMOLOGACION.key"
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div className="space-y-1">
            <Label htmlFor="arcaEnabled">Habilitar facturación electrónica</Label>
            <p className="text-xs text-muted-foreground">
              Si está apagado, las facturas se emiten de forma interna sin CAE.
            </p>
          </div>
          <Switch
            id="arcaEnabled"
            checked={form.enabled}
            onCheckedChange={(checked) => handleField("enabled", checked)}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar configuración"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ArcaSettingsForm;
