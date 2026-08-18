// TRA (Ticket de Requerimiento de Acceso) + firma CMS/PKCS#7 con node-forge.
// El TRA es el XML que WSAA exige firmado (RFC 2315, SHA-1, signed attributes
// content-type + message-digest + signing-time). El CUIT va en el header del
// LoginCms, NO en el TRA.

import forge from "node-forge";

export const buildTra = (
  cuit: string,
  service: string,
  expirationHours = 24,
): string => {
  const generationTime = new Date();
  const expirationTime = new Date(
    generationTime.getTime() + expirationHours * 3600 * 1000,
  );
  // uniqueId: entero largo sin signo (los tests exigen ^\d+$)
  const uniqueId = `${Date.now()}${cuit.slice(-4)}${Math.floor(
    Math.random() * 1000,
  )}`;

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0">' +
    "<header>" +
    `<uniqueId>${uniqueId}</uniqueId>` +
    `<generationTime>${generationTime.toISOString()}</generationTime>` +
    `<expirationTime>${expirationTime.toISOString()}</expirationTime>` +
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
