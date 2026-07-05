import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getMe } from "../services/onboardingService";
import { useBotConfig, useUpdateBotConfig } from "../components/hooks/useBotConfig";
import { Loader } from "../components/atoms/loader";

const KNOWLEDGE_PLACEHOLDER = `Ejemplo:
- Somos una ferretería en Rosario. Horario: Lun a Vie 9 a 18 hs, Sáb 9 a 13 hs.
- Hacemos envíos a todo el país (Andreani / Correo Argentino), 2 a 5 días hábiles.
- Envío gratis en compras superiores a $50.000.
- Formas de pago: efectivo, transferencia, tarjeta hasta 3 cuotas.
- Cambios y devoluciones dentro de los 30 días con ticket.
- Productos destacados: herramientas eléctricas, pinturas, tornillería.`;

const KNOWLEDGE_MAX = 5000;

export const BotConfig = () => {
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });

  const { config, loading: configLoading, error } = useBotConfig();
  const { updateConfig, loading: saving } = useUpdateBotConfig();

  const [enabled, setEnabled] = useState(false);
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [dailyLimit, setDailyLimit] = useState<number>(0);

  // Sincroniza el form local cuando llega/cambia la config del server.
  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setKnowledgeBase(config.knowledgeBase ?? "");
      setDailyLimit(config.dailyLimit ?? 0);
    }
  }, [config]);

  if (meLoading || !me) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader />
      </div>
    );
  }

  const plan = me.organization.plan ?? "BASICO";
  const isPremium = plan === "PREMIUM";

  // Gate de la vista: si un no-PREMIUM llega igual (URL directa), mostramos el
  // estado bloqueado y NO renderizamos la config editable.
  if (!isPremium) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Lock className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            El Asistente IA está disponible en el plan Premium
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Mejorá tu plan a Premium para activar un asistente que responde a los
            visitantes de tu tienda las 24 horas con la información de tu negocio.
          </p>
        </div>
      </div>
    );
  }

  const isDirty =
    !!config &&
    (enabled !== config.enabled ||
      knowledgeBase !== (config.knowledgeBase ?? "") ||
      dailyLimit !== (config.dailyLimit ?? 0));

  const handleSave = () => {
    updateConfig({
      enabled,
      knowledgeBase,
      dailyLimit,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">
                Asistente IA
              </h1>
              <Badge variant="secondary" className="gap-1">
                <Sparkles className="h-3 w-3" />
                Premium
              </Badge>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Un asistente que responde a los visitantes de tu tienda las 24
              horas usando la información que cargues acá: productos, horarios,
              envíos, pagos y políticas.
            </p>
          </div>
        </div>
      </div>

      {configLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No pudimos cargar la configuración del asistente.
            <br />
            {error.message}
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Activación */}
          <Card>
            <CardContent className="flex items-center justify-between gap-4 pt-6">
              <div className="space-y-0.5">
                <Label htmlFor="bot-enabled" className="text-base">
                  Activar asistente IA
                </Label>
                <p className="text-sm text-muted-foreground">
                  Cuando está activo, el asistente aparece en tu tienda y
                  responde automáticamente.
                </p>
              </div>
              <Switch
                id="bot-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </CardContent>
          </Card>

          {/* Base de conocimiento */}
          <Card>
            <CardHeader>
              <CardTitle>Base de conocimiento</CardTitle>
              <CardDescription>
                Contá todo lo que el asistente debe saber de tu negocio. Cuanto
                más completo, mejores respuestas: productos y precios, horarios
                de atención, zonas y costos de envío, medios de pago, políticas
                de cambio y preguntas frecuentes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Textarea
                id="bot-knowledge"
                value={knowledgeBase}
                onChange={(e) =>
                  setKnowledgeBase(e.target.value.slice(0, KNOWLEDGE_MAX))
                }
                placeholder={KNOWLEDGE_PLACEHOLDER}
                className="min-h-64 resize-y"
              />
              <div className="flex justify-end">
                <span className="text-xs text-muted-foreground">
                  {knowledgeBase.length} / {KNOWLEDGE_MAX} caracteres
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Avanzado */}
          <Card>
            <CardHeader>
              <CardTitle>Ajustes avanzados</CardTitle>
              <CardDescription>
                Opcional. Controlá cuántas respuestas puede dar el asistente por
                día.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid max-w-xs gap-2">
                <Label htmlFor="bot-daily-limit">Límite diario de respuestas</Label>
                <Input
                  id="bot-daily-limit"
                  type="number"
                  min={0}
                  value={dailyLimit}
                  onChange={(e) =>
                    setDailyLimit(Math.max(0, Number(e.target.value) || 0))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  0 = sin límite.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Guardar */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!isDirty || saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
