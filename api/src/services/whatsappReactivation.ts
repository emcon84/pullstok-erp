// Job periódico de re-activación del bot de WhatsApp por inactividad.
//
// Cuando un operador ESCALA una conversación de WhatsApp a HUMAN (handoff) pero
// no la atiende, el cliente queda esperando indefinidamente en "modo humano" y
// el bot se calla. Este job detecta esas colgadas: si la conversación sigue en
// HUMAN y hace N minutos que NO hubo mensajes (lastMessageAt hace más de N min),
// la vuelve a BOT y limpia whatsappStage=null para que el flujo arranque desde
// START ante el próximo mensaje del cliente.
//
// MULTI-TENANT: el job corre SIN contexto de organización (no hay request) →
// usamos basePrisma con where EXPLÍCITO y NUNCA el `prisma` scopeado (que
// lanzaría "sin contexto de org"). Mismo patrón que botService usa con Counter
// / Organization.
import { basePrisma } from "../config/db";

export const INACTIVITY_MINUTES_DEFAULT = 10;

// Lee una var de env como entero positivo; devuelve null si falta o no es válida.
const parsePositiveInt = (raw: string | undefined): number | null => {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Baja a modo BOT las conversaciones de WhatsApp escaladas a HUMAN que llevan
 * N minutos SIN actividad (sin nuevos mensajes). Devuelve cuántas se reactivaron.
 *
 * Parámetros inyectables para testear: `inactivityMinutes` (default env
 * KAPSO_REACTIVATE_MINUTES o INACTIVITY_MINUTES_DEFAULT) y `now` (default
 * `new Date()`).
 */
export const reactivateIdleWhatsappConversations = async (args?: {
  inactivityMinutes?: number;
  now?: Date;
}): Promise<number> => {
  const minutes =
    args?.inactivityMinutes ??
    parsePositiveInt(process.env.KAPSO_REACTIVATE_MINUTES) ??
    INACTIVITY_MINUTES_DEFAULT;
  const now = args?.now ?? new Date();

  // cutoff = ahora menos N minutos. Todo lastMessageAt ANTERIOR a este instante
  // significa "sin nuevos mensajes en N minutos" → conversación INACTIVA. Es el
  // criterio seguro: si un operador está atendiendo, cada mensaje refresca
  // lastMessageAt, así que una conversación activa JAMÁS cae acá (no se la pisa).
  const cutoff = new Date(now.getTime() - minutes * 60_000);

  const { count } = await basePrisma.conversation.updateMany({
    where: {
      channel: "WHATSAPP",
      mode: "HUMAN",
      lastMessageAt: { not: null, lt: cutoff },
    },
    data: {
      mode: "BOT",
      // Limpiamos el nodo del flujo para que arranque desde START: si quedó a
      // mitad de un pedido (p.ej. esperando dirección), al retomar el bot el
      // próximo mensaje re-planea el flujo desde el inicio.
      whatsappStage: null,
    },
  });

  return count;
};

/**
 * Arranca el scheduler del job. Corre `reactivateIdleWhatsappConversations()`
 * cada `RUN_INTERVAL_MS` (default 60.000 ms = 1 min, configurable por env
 * KAPSO_REACTIVATE_INTERVAL_MS). Devuelve el handle de setInterval para poder
 * limpiarlo en tests.
 *
 * Un fallo del job NUNCA debe crashear el server: todo va envuelto en try/catch.
 */
export const startWhatsappReactivationScheduler = (): ReturnType<
  typeof setInterval
> => {
  const intervalMs =
    parsePositiveInt(process.env.KAPSO_REACTIVATE_INTERVAL_MS) ?? 60_000;

  const run = async () => {
    try {
      await reactivateIdleWhatsappConversations();
    } catch (err) {
      console.error("[whatsappReactivation] job falló", err);
    }
  };

  const handle = setInterval(run, intervalMs);

  console.log(
    `[whatsappReactivation] scheduler iniciado cada ${Math.round(
      intervalMs / 60_000,
    )} min`,
  );

  return handle;
};

export default {
  reactivateIdleWhatsappConversations,
  startWhatsappReactivationScheduler,
  INACTIVITY_MINUTES_DEFAULT,
};
