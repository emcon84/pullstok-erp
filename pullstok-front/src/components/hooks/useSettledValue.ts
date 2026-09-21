import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Devuelve `value` recién después de que dejó de cambiar durante `delayMs`
 * (settle). Pensado para consumidores caros que no deben re-renderizarse en
 * cada tecla (p. ej. un área de impresión con una fila por producto).
 *
 * `flush` adopta el último valor de inmediato — para cuando el consumidor se
 * necesita YA (imprimir) y no puede quedar desactualizado.
 */
export function useSettledValue<T>(value: T, delayMs: number): [T, () => void] {
  const [settled, setSettled] = useState(value);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  const flush = useCallback(() => setSettled(latest.current), []);

  return [settled, flush];
}
