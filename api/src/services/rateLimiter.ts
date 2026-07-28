/**
 * Rate limiter in-memory con ventana deslizante de 15 minutos por clave.
 *
 * A escala actual (<1000 usuarios), la huella de memoria es despreciable.
 * Los callers SON responsables de elegir maxAttempts y windowMs según el
 * endpoint (forgot-password usa 3 intentos cada 15 min por email).
 *
 * Cleanup automático cada 10 minutos: barre las entradas cuyos timestamps
 * cayeron fuera de la ventana más larga registrada, liberando memoria de
 * claves que ya no reciben tráfico.
 */

const DEFAULT_CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 min

interface KeyEntry {
  timestamps: number[];
  windowMs: number; // ventana máxima registrada para esta clave
}

export class RateLimiter {
  private store: Map<string, KeyEntry> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupStale();
    }, DEFAULT_CLEANUP_INTERVAL_MS);
  }

  /**
   * Registra un intento para `key` y devuelve `true` si se superó el límite.
   *
   * @param key — identificador de la acción (ej. email del usuario)
   * @param maxAttempts — cantidad máxima de intentos dentro de la ventana
   * @param windowMs — duración de la ventana deslizante en milisegundos
   */
  isRateLimited(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [], windowMs };
      this.store.set(key, entry);
    } else {
      // Extiende la ventana máxima si se pasa un valor mayor
      if (windowMs > entry.windowMs) {
        entry.windowMs = windowMs;
      }
    }

    // Limpia timestamps fuera de la ventana (deslizante)
    entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

    // Si todavía está rate-limited después de limpiar vencidos, bloquea
    if (entry.timestamps.length >= maxAttempts) {
      return true;
    }

    // Registra este intento
    entry.timestamps.push(now);
    return false;
  }

  /**
   * Barre entradas stale (todas las claves cuyos timestamps cayeron fuera
   * de su ventana) para liberar memoria. Se ejecuta automáticamente cada
   * 10 minutos. También es invocable manualmente para tests.
   */
  private cleanupStale(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      // Filtra timestamps vencidos
      entry.timestamps = entry.timestamps.filter(
        (ts) => now - ts < entry.windowMs,
      );
      // Si no quedan timestamps, elimina la clave
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Detiene el timer de cleanup automático (para tests).
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

export default RateLimiter;
