/**
 * Alertas del operador (chat escalado a humano). Todo es best-effort y va
 * envuelto en try/catch: una notificación NUNCA debe romper el flujo.
 *
 * - `playAlert()`        -> beep corto "ding-ding" generado con la Web Audio
 *                           API (sin assets externos, sano para la CSP).
 * - `ensureNotificationPermission()` -> pide permiso de Notification UNA vez
 *                           (solo si está en "default"), sin spamear.
 * - `showEscalationNotification(guest)` -> notificación nativa del browser si
 *                           hay permiso; degrada en silencio si no.
 */

// Un solo AudioContext reutilizado (crear uno por beep agota recursos y algunos
// browsers limitan la cantidad de contextos vivos).
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/**
 * Beep distintivo de dos tonos ("ding-ding", A5 -> D6). Usa osciladores con una
 * envolvente rápida para que suene limpio y corto (~0.35s total).
 */
export function playAlert(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // Si el contexto quedó suspendido (autoplay policy), intentamos reanudarlo.
    if (ctx.state === "suspended") void ctx.resume();

    const now = ctx.currentTime;
    const tones = [880, 1174.66]; // A5, D6

    tones.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;

      const start = now + i * 0.18;
      const end = start + 0.15;
      // Envolvente exponencial: ataque rápido y caída suave, sin "clicks".
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    });
  } catch {
    // Algunos browsers bloquean audio sin interacción previa del usuario: que
    // no rompa. El toast in-app sigue avisando igual.
  }
}

let barkAudio: HTMLAudioElement | null = null;

/**
 * Ladrido de perro para avisar un pedido nuevo por WhatsApp. Reusa una única
 * instancia de <audio> apuntando al asset `public/sounds/dog-bark.wav`. Si el
 * navegador bloquea la reproducción (autoplay) o el asset falla, cae al beep
 * clásico (playAlert) para no quedarse en silencio.
 */
export function playDogBark(): void {
  try {
    if (typeof Audio === "undefined") return;
    if (!barkAudio) barkAudio = new Audio("/sounds/dog-bark.wav");
    barkAudio.currentTime = 0;
    const p = barkAudio.play();
    if (p) p.catch(() => playAlert());
  } catch {
    playAlert();
  }
}

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Pide el permiso de notificaciones SOLO si está en "default" (nunca decidido).
 * Si ya está "granted" o "denied" no vuelve a molestar. Llamar desde un lugar
 * poco intrusivo (ej. al entrar a Mensajes), no en cada carga de la app.
 */
export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/**
 * Notificación nativa del browser para un chat escalado. Si no hay permiso
 * degrada en silencio (el sonido + toast alcanzan). `tag` colapsa varias
 * escaladas en una sola notificación en vez de apilarlas.
 */
export function showEscalationNotification(guest: string): void {
  try {
    if (!notificationsSupported() || Notification.permission !== "granted") {
      return;
    }
    const notification = new Notification("🔔 Un cliente pide atención", {
      body: `${guest} quiere hablar con una persona`,
      tag: "chat-escalation",
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // no-op
      }
      notification.close();
    };
  } catch {
    // no-op: la notificación es un extra, nunca crítica.
  }
}
