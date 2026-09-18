import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Upload } from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  getArcaCertificates,
  uploadArcaCertificate,
  verifyArcaService,
  ArcaVerifyCooldownError,
  type ArcaEnvironment,
  type ArcaCertificateMetadata,
  type ArcaService,
  type ArcaServiceCheckResult,
} from "../../../services/arcaService";
import { Loader } from "@/components/atoms/loader";

/**
 * Form de configuración ARCA del emisor (sdd/arca-certificados-self-service).
 * El certificado (cert+key) se sube directo acá por ambiente — nunca viaja de
 * vuelta: una vez cargado solo se muestra su metadata (vigencia, titular).
 * El switch de ambiente queda bloqueado si el ambiente destino no tiene
 * certificado cargado (el backend igual lo re-valida al guardar).
 */
const toField = (value: string | null | undefined) => value ?? "";

const ENVIRONMENTS: { value: ArcaEnvironment; label: string }[] = [
  { value: "HOMOLOGACION", label: "Homologación" },
  { value: "PRODUCCION", label: "Producción" },
];

const SERVICES: { value: ArcaService; label: string }[] = [
  { value: "wsfe", label: "Facturación (WSFE)" },
  { value: "ws_sr_padron_a4", label: "Padrón A4 (autocompletar clientes)" },
];

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });

interface CertificateCardProps {
  environment: ArcaEnvironment;
  label: string;
  metadata: ArcaCertificateMetadata | null | undefined;
  onUploaded: () => void;
}

const CertificateCard = ({ environment, label, metadata, onUploaded }: CertificateCardProps) => {
  const certInputRef = useRef<HTMLInputElement>(null);
  const keyInputRef = useRef<HTMLInputElement>(null);
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);

  const mutation = useMutation({
    mutationFn: () => uploadArcaCertificate(environment, certFile!, keyFile!),
    onSuccess: () => {
      toast.success(`Certificado de ${label} cargado`);
      setCertFile(null);
      setKeyFile(null);
      if (certInputRef.current) certInputRef.current.value = "";
      if (keyInputRef.current) keyInputRef.current.value = "";
      onUploaded();
    },
    onError: (error: Error) => {
      toast.error(error.message || "Error al subir el certificado");
    },
  });

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        {metadata ? (
          <Badge variant={metadata.isExpired ? "destructive" : "default"}>
            {metadata.isExpired ? "Vencido" : "Cargado"}
          </Badge>
        ) : (
          <Badge variant="destructive">No cargado</Badge>
        )}
      </div>

      {metadata && (
        <p className="text-xs text-muted-foreground">
          {metadata.subjectCn ?? "—"}
          {metadata.subjectCuit ? ` · CUIT ${metadata.subjectCuit}` : ""} · vence{" "}
          {formatDate(metadata.validTo)}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`arcaCert-${environment}`} className="text-xs">
            Certificado (.crt)
          </Label>
          <Input
            id={`arcaCert-${environment}`}
            ref={certInputRef}
            type="file"
            accept=".crt,.pem"
            onChange={(e) => setCertFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`arcaKey-${environment}`} className="text-xs">
            Clave privada (.key)
          </Label>
          <Input
            id={`arcaKey-${environment}`}
            ref={keyInputRef}
            type="file"
            accept=".key,.pem"
            onChange={(e) => setKeyFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>

      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={!certFile || !keyFile || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? (
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-2 h-3.5 w-3.5" />
        )}
        {metadata ? `Rotar certificado de ${label}` : `Subir certificado de ${label}`}
      </Button>
    </div>
  );
};

const STATUS_ICON: Record<ArcaServiceCheckResult["status"], typeof ShieldCheck> = {
  habilitado: ShieldCheck,
  no_habilitado: ShieldAlert,
  error: ShieldQuestion,
};

const STATUS_VARIANT: Record<ArcaServiceCheckResult["status"], "default" | "destructive" | "secondary"> = {
  habilitado: "default",
  no_habilitado: "destructive",
  error: "secondary",
};

interface ServiceCheckRowProps {
  service: ArcaService;
  label: string;
}

const ServiceCheckRow = ({ service, label }: ServiceCheckRowProps) => {
  const [result, setResult] = useState<ArcaServiceCheckResult | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (cooldownUntil === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const remainingSeconds =
    cooldownUntil !== null ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000)) : 0;
  const onCooldown = remainingSeconds > 0;

  const mutation = useMutation({
    mutationFn: () => verifyArcaService(service),
    onSuccess: (data) => {
      setResult(data);
      setCooldownUntil(Date.now() + 5 * 60 * 1000);
    },
    onError: (error: Error) => {
      if (error instanceof ArcaVerifyCooldownError) {
        setCooldownUntil(Date.now() + error.retryAfterSeconds * 1000);
        toast.error(error.message);
        return;
      }
      toast.error(error.message || "Error al verificar el servicio");
    },
  });

  const Icon = result ? STATUS_ICON[result.status] : ShieldQuestion;

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{label}</p>
          {result && (
            <p className="text-xs text-muted-foreground">{result.message}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {result && <Badge variant={STATUS_VARIANT[result.status]}>{result.status}</Badge>}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={mutation.isPending || onCooldown}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending
            ? "Verificando…"
            : onCooldown
              ? `Reintentar en ${remainingSeconds}s`
              : "Verificar"}
        </Button>
      </div>
    </div>
  );
};

export const ArcaSettingsForm = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["arca-settings"],
    queryFn: getArcaSettings,
    staleTime: Infinity,
  });
  const { data: certificates, refetch: refetchCertificates } = useQuery({
    queryKey: ["arca-certificates"],
    queryFn: getArcaCertificates,
    staleTime: Infinity,
  });

  const [form, setForm] = useState({
    cuitEmisor: "",
    padronCuit: "",
    puntoVenta: "",
    environment: "HOMOLOGACION" as ArcaEnvironment,
    enabled: false,
  });

  useEffect(() => {
    if (data) {
      setForm({
        cuitEmisor: toField(data.cuitEmisor),
        padronCuit: toField(data.padronCuit),
        puntoVenta: data.puntoVenta != null ? String(data.puntoVenta) : "",
        environment: data.environment,
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
      enabled: form.enabled,
    });
  };

  const targetHasCertificate = certificates ? !!certificates[form.environment] : true;

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
          venta, certificados y ambiente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
              onChange={(e) => handleField("environment", e.target.value as ArcaEnvironment)}
              className="flex h-10 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ENVIRONMENTS.map((env) => (
                <option
                  key={env.value}
                  value={env.value}
                  disabled={certificates ? !certificates[env.value] : false}
                >
                  {env.label}
                  {certificates && !certificates[env.value] ? " (sin certificado)" : ""}
                </option>
              ))}
            </select>
            {!targetHasCertificate && (
              <p className="text-xs text-destructive">
                Subí el certificado de este ambiente antes de habilitarlo.
              </p>
            )}
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

        <div className="space-y-3">
          <Label>Certificados por ambiente</Label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ENVIRONMENTS.map((env) => (
              <CertificateCard
                key={env.value}
                environment={env.value}
                label={env.label}
                metadata={certificates?.[env.value]}
                onUploaded={() => {
                  refetchCertificates();
                  queryClient.invalidateQueries({ queryKey: ["arca-certificates"] });
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Label>Servicios habilitados en AFIP</Label>
          <p className="text-xs text-muted-foreground">
            Prueba de login contra el ambiente activo ({ENVIRONMENTS.find((e) => e.value === form.environment)?.label}).
            Máximo una verificación cada 5 minutos por servicio.
          </p>
          <div className="space-y-2">
            {SERVICES.map((svc) => (
              <ServiceCheckRow key={svc.value} service={svc.value} label={svc.label} />
            ))}
          </div>
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
