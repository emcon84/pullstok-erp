// Cifrado at-rest AES-256-GCM de la clave privada ARCA
// (sdd/arca-certificados-self-service, T2). Master key en
// ARCA_CERT_ENCRYPTION_KEY (base64 de 32 bytes), mismo nivel de secreto que
// JWT_SECRET. Nunca se cachea la key derivada del env var: se lee en cada
// llamada para que un env var cambiado a mitad de proceso (rotación) no deje
// operaciones colgadas con la key vieja en memoria.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // estándar para GCM
const KEY_LENGTH = 32; // AES-256

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

const resolveMasterKey = (): Buffer => {
  const raw = process.env.ARCA_CERT_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ARCA_CERT_ENCRYPTION_KEY no está configurado en el entorno. " +
        'Generá uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error(
      "ARCA_CERT_ENCRYPTION_KEY no es un valor base64 válido.",
    );
  }

  // Buffer.from(..., "base64") nunca throw con input inválido: descarta
  // caracteres no-base64 en silencio y puede devolver un largo distinto al
  // esperado — por eso el chequeo de longitud es la validación real acá.
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `ARCA_CERT_ENCRYPTION_KEY inválida: se esperaban ${KEY_LENGTH} bytes ` +
        `en base64 (AES-256), se obtuvieron ${key.length}.`,
    );
  }

  return key;
};

export const encryptPrivateKeyPem = (pem: string): EncryptedPayload => {
  const key = resolveMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(pem, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return { ciphertext, iv, authTag };
};

export const decryptPrivateKeyPem = (payload: EncryptedPayload): string => {
  const key = resolveMasterKey();
  const decipher = createDecipheriv(ALGORITHM, key, payload.iv);
  decipher.setAuthTag(payload.authTag);

  const decrypted = Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};
