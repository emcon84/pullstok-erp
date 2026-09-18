import forge from "node-forge";

// Parseo X509 nativo (Node crypto.X509Certificate) para certificados ARCA
// (sdd/arca-certificados-self-service, T2). Fixtures: self-signed generados
// en test-time con node-forge (ya dependencia de traSigner.ts) en vez de
// PEMs commiteados que parezcan reales.

interface GeneratedPair {
  certPem: string;
  keyPem: string;
}

const generateSelfSigned = (opts: {
  cn: string;
  serialNumber?: string;
  validFrom?: Date;
  validTo?: Date;
}): GeneratedPair => {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = opts.validFrom ?? new Date(Date.now() - 24 * 3600 * 1000);
  cert.validity.notAfter =
    opts.validTo ?? new Date(Date.now() + 365 * 24 * 3600 * 1000);

  const attrs: forge.pki.CertificateField[] = [{ name: "commonName", value: opts.cn }];
  if (opts.serialNumber) {
    // "serialNumber" no está en el mapa de shortNames de forge (solo
    // CN/C/L/ST/O/OU/E) — hay que dar el type (OID) explícito.
    attrs.push({ type: forge.pki.oids.serialNumber, value: opts.serialNumber } as any);
  }

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
};

describe("certParsing", () => {
  describe("parseCertificatePem", () => {
    it("parsea subject (CN), issuer y vigencia de un cert válido", () => {
      const { parseCertificatePem } = require("../certParsing");
      const { certPem } = generateSelfSigned({ cn: "pullstok-test" });

      const parsed = parseCertificatePem(certPem);

      expect(parsed.subjectCn).toBe("pullstok-test");
      expect(parsed.issuer).toContain("pullstok-test");
      expect(parsed.validFrom).toBeInstanceOf(Date);
      expect(parsed.validTo).toBeInstanceOf(Date);
      expect(parsed.isExpired).toBe(false);
    });

    it("extrae subjectCuit de un serialNumber con formato 'CUIT ##########'", () => {
      const { parseCertificatePem } = require("../certParsing");
      const { certPem } = generateSelfSigned({
        cn: "test",
        serialNumber: "CUIT 30709706701",
      });

      const parsed = parseCertificatePem(certPem);

      expect(parsed.subjectCuit).toBe("30709706701");
    });

    it("subjectCuit es null cuando el subject no trae un CUIT", () => {
      const { parseCertificatePem } = require("../certParsing");
      const { certPem } = generateSelfSigned({ cn: "sin-cuit" });

      const parsed = parseCertificatePem(certPem);

      expect(parsed.subjectCuit).toBeNull();
    });

    it("isExpired=true para un certificado vencido", () => {
      const { parseCertificatePem } = require("../certParsing");
      const { certPem } = generateSelfSigned({
        cn: "vencido",
        validFrom: new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000),
        validTo: new Date(Date.now() - 24 * 3600 * 1000),
      });

      const parsed = parseCertificatePem(certPem);

      expect(parsed.isExpired).toBe(true);
    });

    it("PEM inválido (sin marker BEGIN CERTIFICATE) → error legible, no un crash nativo críptico", () => {
      const { parseCertificatePem } = require("../certParsing");

      expect(() => parseCertificatePem("no soy un certificado")).toThrow(
        /certificado/i,
      );
    });

    it("PEM con el marker pero contenido corrupto → error legible", () => {
      const { parseCertificatePem } = require("../certParsing");
      const corrupted =
        "-----BEGIN CERTIFICATE-----\nQVNERg==\n-----END CERTIFICATE-----\n";

      expect(() => parseCertificatePem(corrupted)).toThrow();
    });
  });

  describe("privateKeyMatchesCertificate", () => {
    it("devuelve true cuando la key matchea el cert", () => {
      const { privateKeyMatchesCertificate } = require("../certParsing");
      const { certPem, keyPem } = generateSelfSigned({ cn: "match-ok" });

      expect(privateKeyMatchesCertificate(certPem, keyPem)).toBe(true);
    });

    it("devuelve false (no throw) para un par cert/key real pero NO correspondiente", () => {
      const { privateKeyMatchesCertificate } = require("../certParsing");
      const pairA = generateSelfSigned({ cn: "a" });
      const pairB = generateSelfSigned({ cn: "b" });

      expect(
        privateKeyMatchesCertificate(pairA.certPem, pairB.keyPem),
      ).toBe(false);
    });

    it("key PEM inválida → error legible, no un crash nativo críptico", () => {
      const { privateKeyMatchesCertificate } = require("../certParsing");
      const { certPem } = generateSelfSigned({ cn: "cert-ok" });

      expect(() =>
        privateKeyMatchesCertificate(certPem, "no soy una clave"),
      ).toThrow(/clave/i);
    });
  });
});
