import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

/** Vigencia del código de emparejamiento de un agente. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** Un agente se considera online si hizo heartbeat hace menos de esto. */
export const AGENT_ONLINE_WINDOW_MS = 90 * 1000;

// Sin caracteres ambiguos (0/O, 1/I) para tipearlo a mano en la PC de caja.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const sha256Hex = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

/** Código de emparejamiento de un solo uso, formato XXXXX-XXXXX (~50 bits). */
export const generatePairingCode = (): string => {
  const chars = Array.from(
    { length: 10 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
};

/** Mayúsculas y sin guiones/espacios: lo que se hashea y se compara. */
export const normalizePairingCode = (code: string): string =>
  code.toUpperCase().replace(/[\s-]/g, "");

export const hashPairingCode = (code: string): string =>
  sha256Hex(normalizePairingCode(code));

/**
 * Token del agente: `<agentId>.<secreto>`. El id permite ubicar al agente sin
 * saber su organización; el secreto (256 bits) nunca se guarda, solo su hash.
 */
export const generateAgentToken = (agentId: string): string =>
  `${agentId}.${randomBytes(32).toString("hex")}`;

export const hashAgentToken = (token: string): string => sha256Hex(token);

export const parseAgentToken = (token: string): { agentId: string } | null => {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  return { agentId: token.slice(0, dot) };
};

/** Compara el token recibido contra el hash guardado en tiempo constante. */
export const verifyAgentToken = (
  token: string,
  storedHash: string | null | undefined,
): boolean => {
  if (!storedHash) return false;
  const a = Buffer.from(hashAgentToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};
