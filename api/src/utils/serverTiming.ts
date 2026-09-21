/**
 * Formatea métricas para el header HTTP `Server-Timing` (nombre;dur=ms).
 * Solo expone duraciones: sirve para medir en producción dónde se va el tiempo
 * del servidor (DevTools → Network → Timing, o `serverTiming` en
 * PerformanceResourceTiming) sin agregar logs.
 */
export const formatServerTiming = (metrics: Record<string, number>): string =>
  Object.entries(metrics)
    .map(([name, ms]) => `${name};dur=${ms.toFixed(1)}`)
    .join(", ");
