// TRA (Ticket de Requerimiento de Acceso) + firma CMS/PKCS#7 con node-forge.
// El TRA es el XML que WSAA exige firmado (RFC 2315, SHA-1, signed attributes
// content-type + message-digest + signing-time). El CUIT va en el header del
// LoginCms, NO en el TRA.
//
// FORMATO VALIDADO contra el WSAA de homologación (agosto 2026): AFIP homo
// rechaza con `xml.bad / No se ha podido interpretar el XML contra el SCHEMA`
// si las fechas llevan milisegundos u offset (p.ej. toISOString() → "...Z") o
// si el uniqueId es largo (Date.now() → 13 dígitos). El formato que acepta es:
//   - generationTime/expirationTime en hora local "YYYY-MM-DDTHH:mm:ss" (sin
//     milisegundos, sin offset de zona horaria).
//   - uniqueId CORTO (6 dígitos); un valor de 13 dígitos también devuelve
//     xml.bad en homo.
// Con el cert correcto y el servicio autorizado, así obtiene el TicketAcceso.

import forge from "node-forge";

/** uniqueId de 6 dígitos (AFIP homo rechaza valores largos con xml.bad). */
const buildShortUniqueId = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

/** Fecha local sin milisegundos ni offset: "YYYY-MM-DDTHH:mm:ss". */
const formatTraDate = (date: Date): string => {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
};

export const buildTra = (
  _cuit: string,
  service: string,
  expirationHours = 24,
): string => {
  const generationTime = new Date();
  const expirationTime = new Date(
    generationTime.getTime() + expirationHours * 3600 * 1000,
  );

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    "<header>" +
    `<uniqueId>${buildShortUniqueId()}</uniqueId>` +
    `<generationTime>${formatTraDate(generationTime)}</generationTime>` +
    `<expirationTime>${formatTraDate(expirationTime)}</expirationTime>` +
    "</header>" +
    `<service>${service}</service>` +
    "</loginTicketRequest>"
  );
};

/**
 * Firma el TRA y devuelve el CMS/PKCS#7 en base64 (LoginCms.in0).
 * authenticatedAttributes: content-type y message-digest son obligatorios
 * (RFC 2315); signing-time se auto-completa si va sin valor.
 */
export const signTra = (
  traXml: string,
  certPem: string,
  keyPem: string,
): string => {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(traXml, "utf8");
  p7.addCertificate(certPem);
  p7.addSigner({
    key: keyPem,
    certificate: certPem,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime },
    ],
  });
  p7.sign({ detached: false });
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes();
  return forge.util.encode64(der);
};
