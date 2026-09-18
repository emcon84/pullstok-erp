import { randomBytes } from "node:crypto";

// AES-256-GCM at-rest encryption para la clave privada ARCA
// (sdd/arca-certificados-self-service, T2). Round-trip byte-exacto: el PEM
// desencriptado alimenta directamente signTra(tra, certPem, keyPem), así que
// cualquier corrupción de whitespace/line-endings rompería la firma en
// silencio y sería muy difícil de debuggear.

const SAMPLE_PEM =
  "-----BEGIN PRIVATE KEY-----\n" +
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj\n" +
  "MZEeidHnwSFqYqaJU4wZdVQOVo6iWDrtR2kL2hVJvHm3XeXfP5rSXfJcXeXfP5rS\n" +
  "XfJcXeXfP5rSXfJcXeXfP5rSXfJcXeXfP5rSXfJcXeXfP5rSXfJcXeXfP5rSXfJc\n" +
  "-----END PRIVATE KEY-----\n";

const VALID_KEY_B64 = randomBytes(32).toString("base64");

describe("certEncryption", () => {
  const originalEnv = process.env.ARCA_CERT_ENCRYPTION_KEY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ARCA_CERT_ENCRYPTION_KEY;
    } else {
      process.env.ARCA_CERT_ENCRYPTION_KEY = originalEnv;
    }
    jest.resetModules();
  });

  const load = () => {
    // jest.resetModules() en cada test: el módulo lee el env var lazy (al
    // invocar encrypt/decrypt), no en import, pero resetModules mantiene los
    // tests aislados entre sí de todas formas.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("../certEncryption") as typeof import("../certEncryption");
  };

  describe("round-trip", () => {
    it("reproduce el PEM original byte-por-byte, incluyendo estructura multilínea y newline final", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = VALID_KEY_B64;
      const { encryptPrivateKeyPem, decryptPrivateKeyPem } = load();

      const payload = encryptPrivateKeyPem(SAMPLE_PEM);
      const decrypted = decryptPrivateKeyPem(payload);

      expect(decrypted).toBe(SAMPLE_PEM);
      expect(decrypted.endsWith("\n")).toBe(true);
    });

    it("dos encriptaciones del mismo input producen ciphertext distinto (IV no reusado)", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = VALID_KEY_B64;
      const { encryptPrivateKeyPem } = load();

      const a = encryptPrivateKeyPem(SAMPLE_PEM);
      const b = encryptPrivateKeyPem(SAMPLE_PEM);

      expect(a.iv.equals(b.iv)).toBe(false);
      expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
      expect(a.iv).toHaveLength(12);
    });
  });

  describe("env var faltante o inválida", () => {
    it("encryptPrivateKeyPem sin ARCA_CERT_ENCRYPTION_KEY → throw claro", () => {
      delete process.env.ARCA_CERT_ENCRYPTION_KEY;
      const { encryptPrivateKeyPem } = load();

      expect(() => encryptPrivateKeyPem(SAMPLE_PEM)).toThrow(
        /ARCA_CERT_ENCRYPTION_KEY/,
      );
    });

    it("decryptPrivateKeyPem sin ARCA_CERT_ENCRYPTION_KEY → throw claro", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = VALID_KEY_B64;
      const { encryptPrivateKeyPem } = load();
      const payload = encryptPrivateKeyPem(SAMPLE_PEM);

      delete process.env.ARCA_CERT_ENCRYPTION_KEY;
      jest.resetModules();
      const { decryptPrivateKeyPem } = load();

      expect(() => decryptPrivateKeyPem(payload)).toThrow(
        /ARCA_CERT_ENCRYPTION_KEY/,
      );
    });

    it("ARCA_CERT_ENCRYPTION_KEY no es base64 válido de 32 bytes → throw claro", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = "no-soy-base64-de-32-bytes";
      const { encryptPrivateKeyPem } = load();

      expect(() => encryptPrivateKeyPem(SAMPLE_PEM)).toThrow(
        /ARCA_CERT_ENCRYPTION_KEY/,
      );
    });

    it("ARCA_CERT_ENCRYPTION_KEY base64 válido pero longitud incorrecta (no 32 bytes) → throw claro", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = randomBytes(16).toString("base64");
      const { encryptPrivateKeyPem } = load();

      expect(() => encryptPrivateKeyPem(SAMPLE_PEM)).toThrow(
        /ARCA_CERT_ENCRYPTION_KEY/,
      );
    });
  });

  describe("tampering", () => {
    it("ciphertext modificado → decryptPrivateKeyPem throws (GCM auth failure), nunca datos silenciosamente incorrectos", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = VALID_KEY_B64;
      const { encryptPrivateKeyPem, decryptPrivateKeyPem } = load();
      const payload = encryptPrivateKeyPem(SAMPLE_PEM);

      const tampered = Buffer.from(payload.ciphertext);
      tampered[0] = tampered[0] ^ 0xff;

      expect(() =>
        decryptPrivateKeyPem({ ...payload, ciphertext: tampered }),
      ).toThrow();
    });

    it("authTag modificado → decryptPrivateKeyPem throws (GCM auth failure)", () => {
      process.env.ARCA_CERT_ENCRYPTION_KEY = VALID_KEY_B64;
      const { encryptPrivateKeyPem, decryptPrivateKeyPem } = load();
      const payload = encryptPrivateKeyPem(SAMPLE_PEM);

      const tampered = Buffer.from(payload.authTag);
      tampered[0] = tampered[0] ^ 0xff;

      expect(() =>
        decryptPrivateKeyPem({ ...payload, authTag: tampered }),
      ).toThrow();
    });
  });
});
