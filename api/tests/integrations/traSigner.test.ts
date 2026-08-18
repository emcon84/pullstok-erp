import forge from "node-forge";
import { buildTra, signTra } from "../../src/integrations/arca/traSigner";

// TRA (Ticket de Requerimiento de Acceso) + firma CMS/PKCS7 con node-forge
// (spec 1 arca-wsaa-auth). Los tests generan un certificado self-signed en
// memoria (sin red, sin fixtures): la firma se valida parseando el CMS de
// vuelta con forge y comparando el contenido firmado contra el TRA.

describe("buildTra", () => {
  it("arma el loginTicketRequest con header, uniqueId y service wsfe", () => {
    const tra = buildTra("30709706701", "wsfe");

    expect(tra).toContain('<?xml version="1.0"');
    expect(tra).toContain('<loginTicketRequest version="1.0">');
    expect(tra).toContain("<uniqueId>");
    expect(tra).toContain("<generationTime>");
    expect(tra).toContain("<expirationTime>");
    expect(tra).toContain("<service>wsfe</service>");
  });

  it("genera uniqueId numérico y expirationTime posterior a generationTime (TRA de 1 día)", () => {
    const tra = buildTra("30709706701", "wsfe");

    const uniqueId = tra.match(/<uniqueId>(\d+)<\/uniqueId>/)?.[1];
    const generation = tra.match(/<generationTime>([^<]+)<\/generationTime>/)?.[1];
    const expiration = tra.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1];

    expect(uniqueId).toMatch(/^\d+$/);
    expect(generation).toBeDefined();
    expect(expiration).toBeDefined();
    const genMs = new Date(generation!).getTime();
    const expMs = new Date(expiration!).getTime();
    expect(expMs).toBeGreaterThan(genMs);
    // ~24 h (tolerancia: test lento)
    expect(expMs - genMs).toBeGreaterThan(23 * 3600 * 1000);
    expect(expMs - genMs).toBeLessThanOrEqual(25 * 3600 * 1000);
  });

  it("expiración configurable (2 h)", () => {
    const tra = buildTra("30709706701", "wsfe", 2);
    const generation = tra.match(/<generationTime>([^<]+)<\/generationTime>/)?.[1]!;
    const expiration = tra.match(/<expirationTime>([^<]+)<\/expirationTime>/)?.[1]!;
    expect(
      new Date(expiration).getTime() - new Date(generation).getTime(),
    ).toBeCloseTo(2 * 3600 * 1000, -4);
  });
});

describe("signTra", () => {
  // Certificado self-signed efímero (forge, en memoria — sin archivos).
  const keypair = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keypair.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 1000);
  cert.validity.notAfter = new Date(Date.now() + 3600 * 1000);
  cert.setSubject([{ name: "commonName", value: "ARCA-TEST" }]);
  cert.setIssuer([{ name: "commonName", value: "ARCA-TEST" }]);
  cert.sign(keypair.privateKey);
  const CERT_PEM = forge.pki.certificateToPem(cert);
  const KEY_PEM = forge.pki.privateKeyToPem(keypair.privateKey);

  it("firma el TRA como CMS/PKCS7 base64 cuyo contenido es exactamente el TRA", () => {
    const tra = buildTra("30709706701", "wsfe");
    const cmsB64 = signTra(tra, CERT_PEM, KEY_PEM);

    // Es base64 válido
    expect(cmsB64).toMatch(/^[A-Za-z0-9+/=\r\n]+$/);
    const der = forge.util.decode64(cmsB64);

    // Navega el ASN.1 del SignedData para extraer el eContent embebido:
    // ContentInfo → [0] SignedData → encapContentInfo → [0] → OCTETSTRING
    // (forge.messageFromAsn1 no desenvuelve el [0] EXPLICIT de eContent)
    const derObj = forge.asn1.fromDer(forge.util.createBuffer(der, "raw"));
    const asn1Values = (n: forge.asn1.Asn1): forge.asn1.Asn1[] =>
      Array.isArray(n.value) ? n.value : [];
    const signedData = asn1Values(asn1Values(derObj)[1])[0];
    const encapContentInfo = asn1Values(signedData)[2];
    const eContentWrapper = asn1Values(encapContentInfo)[1];
    const octet = asn1Values(eContentWrapper)[0];
    const content = forge.util.decodeUtf8(octet.value as string);

    expect(content).toBe(tra);
    expect(content).toContain("<service>wsfe</service>");
    // El TRA NO lleva CUIT (va en el header del LoginCms), solo el servicio
    expect(content).not.toContain("<cuit>");
  });
});
