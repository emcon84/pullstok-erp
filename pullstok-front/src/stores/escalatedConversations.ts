import { useSyncExternalStore } from "react";

/**
 * Store en-sesión (módulo, sin persistencia) de las conversaciones escaladas a
 * humano. El backend NO expone `escalatedAt`/`mode` en `ConversationDTO`, así
 * que el flag de "pide atención" no sobrevive a un refresh: lo trackeamos acá,
 * en memoria, mientras dura la sesión del operador.
 *
 * - `markEscalated(id)`  -> lo llama el hook global al recibir `chat:escalated`.
 * - `clearEscalated(id)` -> se limpia cuando el operador ABRE la conversación.
 * - `useEscalatedConversations()` -> set reactivo para resaltar la bandeja.
 *
 * Implementado con `useSyncExternalStore` (sin dependencias extra, mismo patrón
 * que `authController`). El snapshot se cachea y solo cambia en cada `emit()`
 * para no romper la identidad referencial (si devolviéramos un Set nuevo en
 * cada `getSnapshot`, React entraría en loop infinito).
 */

const escalated = new Set<string>();
const listeners = new Set<() => void>();
let snapshot: ReadonlySet<string> = new Set<string>();

function emit(): void {
  snapshot = new Set(escalated);
  listeners.forEach((listener) => listener());
}

export function markEscalated(conversationId: string): void {
  if (escalated.has(conversationId)) return;
  escalated.add(conversationId);
  emit();
}

export function clearEscalated(conversationId: string): void {
  if (!escalated.delete(conversationId)) return;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReadonlySet<string> {
  return snapshot;
}

/** Set reactivo de ids escalados. Re-renderiza al marcar/limpiar. */
export function useEscalatedConversations(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
