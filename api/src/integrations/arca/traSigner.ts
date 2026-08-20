// TRA (Ticket de Requerimiento de Acceso) + firma CMS/PKCS#7 con node-forge.
// El TRA es el XML que WSAA exige firmado (RFC 2315, SHA-1, signed attributes
// content-type + message-digest + signing-time). El CUIT va en el header del
// LoginCms, NO en el TRA.
//
// FORMATO VALIDADO contra el WSAA de homologación (agosto 2026): AFIP homo
// rechaza con `xml.bad / No se ha podido interpretar el XML contra el SCHEMA`
// si las fechas llevan milisegundos u offset (p.ej. toISOString() → "...Z") o
// si el uniqueId es largo (Date.now() → 13 dígitos). El formato que acepta es:
//   - generationTime/expirationTime en hora de BUENOS AIRES "YYYY-MM-DDTHH:mm:ss"
//     (sin milisegundos, sin offset). IMPORTANTE: AFIP valida la hora contra
//     America/Argentina/Buenos_Aires; si el servidor está en otra zona (p.ej.
//     UTC en el VPS) hay que convertir, si no AFIP ve la fecha en el futuro y
//     responde "generationTime posee formato o dato inválido".
//   - uniqueId CORTO (6 dígitos); un valor de 13 dígitos también devuelve
//     xml.bad en homo.
// Con el cert correcto y el servicio autorizado, así obtiene el TicketAcceso.

import forge from "node-forge";

/** uniqueId de 6 dígitos (AFIP homo rechaza valores largos con xml.bad). */
const buildShortUniqueId = (): string =>
  String(Math.floor(100000 + Math.random() * 900000));

// Argentina no usa DST desde 2009: UTC-3 fijo.
const BUENOS_AIRES_OFFSET_MS = -3 * 3600 * 1000;

// Duración del TRA por defecto: 12 h. NO usar 24 h exactas: AFIP homo rechaza
// con `ns1:xml.expirationTime.invalid / vencimiento en más de 24 horas` si por
// desfase de reloj el expirationTime queda > 24 h respecto al reloj de AFIP.
// Con 12 h queda margen de sobra y el TA real caduca a las 12 h de todos modos.

// Margen que se resta al generationTime para evitar que AFIP lo vea "en el
// futuro" por desfase de reloj (ns1:xml.generationTime.invalid). 2 minutos.
const GENERATION_SKEW_MS = 2 * 60 * 1000;

/** Fecha en hora de Buenos Aires, sin milisegundos ni offset:
 * "YYYY-MM-DDTHH:mm:ss". AFIP valida la hora contra esta zona, NO contra la
 * zona del servidor (que en el VPS es UTC). */
const formatTraDate = (date: Date): string => {
  const buenosAires = new Date(date.getTime() + BUENOS_AIRES_OFFSET_MS);
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${buenosAires.getUTCFullYear()}-${pad(buenosAires.getUTCMonth() + 1)}-${pad(buenosAires.getUTCDate())}` +
    `T${pad(buenosAires.getUTCHours())}:${pad(buenosAires.getUTCMinutes())}:${pad(buenosAires.getUTCSeconds())}`
  );
};

export const buildTra = (
  _cuit: string,
  service: string,
  expirationHours = 12,
): string => {
  // Margen de seguridad: AFIP rechaza el TRA si el generationTime queda "en el
  // futuro" respecto al reloj de AFIP (ns1:xml.generationTime.invalid). Por
  // desfase de reloj entre el servidor y AFIP (aun de unos segundos) conviene
  // restar unos minutos para que generationTime quede holgadamente en el pasado.
  const generationTime = new Date(Date.now() - GENERATION_SKEW_MS);
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
