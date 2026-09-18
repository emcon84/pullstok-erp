// Parseo de certificados/keys X509 para ARCA (sdd/arca-certificados-self-service,
// T2). Usa crypto.X509Certificate nativo de Node (disponible desde 15.6, este
// proyecto corre Node 20) — sin dependencias nuevas.

import { X509Certificate, createPrivateKey } from "node:crypto";

export interface ParsedCertificate {
  subjectCn: string | null;
  subjectCuit: string | null;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  isExpired: boolean;
}

const CERT_MARKER = "-----BEGIN CERTIFICATE-----";

/** RFC 4514 style, un RDN por línea (formato de Node): "CN=x\nserialNumber=y". */
const extractDnField = (dn: string, field: string): string | null => {
  const line = dn.split("\n").find((l) => l.trim().startsWith(`${field}=`));
  return line ? line.trim().slice(field.length + 1) : null;
};

/** Busca "CUIT ##########" en cualquier campo del subject (mismo shape que
 * `openssl x509 -subject` en los certs reales, ej. "serialNumber=CUIT 30709706701"). */
const extractCuit = (subject: string): string | null => {
  const match = subject.match(/CUIT\s+(\d{11})/);
  return match ? match[1] : null;
};

export const parseCertificatePem = (certPem: string): ParsedCertificate => {
  if (typeof certPem !== "string" || !certPem.includes(CERT_MARKER)) {
    throw new Error(
      "El archivo no es un certificado PEM válido (falta el marcador -----BEGIN CERTIFICATE-----).",
    );
  }

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch (err) {
    throw new Error(
      `No se pudo interpretar el certificado: ${(err as Error).message}`,
    );
  }

  const validFrom = new Date(cert.validFrom);
  const validTo = new Date(cert.validTo);

  return {
    subjectCn: extractDnField(cert.subject, "CN"),
    subjectCuit: extractCuit(cert.subject),
    issuer: cert.issuer,
    validFrom,
    validTo,
    isExpired: validTo.getTime() < Date.now(),
  };
};

export const privateKeyMatchesCertificate = (
  certPem: string,
  keyPem: string,
): boolean => {
  if (typeof certPem !== "string" || !certPem.includes(CERT_MARKER)) {
    throw new Error(
      "El archivo no es un certificado PEM válido (falta el marcador -----BEGIN CERTIFICATE-----).",
    );
  }

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch (err) {
    throw new Error(
      `No se pudo interpretar el certificado: ${(err as Error).message}`,
    );
  }

  let keyObject;
  try {
    keyObject = createPrivateKey(keyPem);
  } catch (err) {
    throw new Error(
      `El archivo no es una clave privada PEM válida: ${(err as Error).message}`,
    );
  }

  return cert.checkPrivateKey(keyObject);
};
