import { createHash, timingSafeEqual } from "crypto";
import {
  BALANCES_TOKEN_TTL_SEC,
  generateBalancesToken,
  verifyBalancesToken,
} from "../utils/jwtUtils";

/**
 * Password lock for the customer balances summary. The password lives in the
 * BALANCES_VIEW_PASSWORD env var (never stored, logged or returned). Unlocking
 * yields a short-lived token bound to user + org; failed attempts are limited
 * per user (in-memory: resets on restart and is per-process, acceptable for a
 * single-instance deployment).
 */

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

interface Subject {
  userId: string;
  organizationId: string;
}

const failures = new Map<string, { count: number; resetAt: number }>();

const domainError = (code: string, message: string) => {
  const err: any = new Error(message);
  err.code = code;
  return err;
};

const sha256 = (v: string) => createHash("sha256").update(v, "utf8").digest();

const passwordMatches = (candidate: string, expected: string): boolean =>
  timingSafeEqual(sha256(candidate), sha256(expected));

const currentFailures = (userId: string): number => {
  const entry = failures.get(userId);
  if (!entry) return 0;
  if (Date.now() >= entry.resetAt) {
    failures.delete(userId);
    return 0;
  }
  return entry.count;
};

const registerFailure = (userId: string) => {
  const count = currentFailures(userId);
  const prev = failures.get(userId);
  failures.set(userId, { count: count + 1, resetAt: prev?.resetAt ?? Date.now() + WINDOW_MS });
};

const unlock = (subject: Subject, password: string) => {
  const expected = process.env.BALANCES_VIEW_PASSWORD;
  if (!expected) {
    throw domainError(
      "BALANCES_LOCK_NOT_CONFIGURED",
      "La contraseña de saldos no está configurada en el servidor",
    );
  }
  if (currentFailures(subject.userId) >= MAX_FAILURES) {
    throw domainError(
      "BALANCES_RATE_LIMITED",
      "Demasiados intentos fallidos. Probá de nuevo en unos minutos.",
    );
  }
  if (typeof password !== "string" || !passwordMatches(password, expected)) {
    registerFailure(subject.userId);
    throw domainError("INVALID_BALANCES_PASSWORD", "Contraseña incorrecta");
  }
  failures.delete(subject.userId);
  return {
    token: generateBalancesToken(subject.userId, subject.organizationId),
    expiresInSec: BALANCES_TOKEN_TTL_SEC,
  };
};

/** Throws BALANCES_LOCKED unless the token is valid and bound to this user + org. */
const assertToken = (token: string | undefined, subject: Subject): void => {
  const locked = () => domainError("BALANCES_LOCKED", "Los saldos están bloqueados");
  if (!token || !subject.userId || !subject.organizationId) throw locked();
  try {
    const payload = verifyBalancesToken(token);
    if (payload.sub !== subject.userId || payload.organizationId !== subject.organizationId) {
      throw locked();
    }
  } catch {
    throw locked();
  }
};

/** Test helper: clears the in-memory limiter. */
export const __resetBalancesLockForTests = () => failures.clear();

export default { unlock, assertToken };
