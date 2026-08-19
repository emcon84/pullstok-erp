// Transporte SOAP 1.1 de la capa ARCA (WSAA + WSFEv1).
// - Envelope estándar + namespace de negocio inyectado por el caller.
// - Parseo con fast-xml-parser v5 (sin atributos, valores como string,
//   sin prefijo de namespace: las claves quedan "Envelope/Body/...").
// - Política de reintento: 1 retry SOLO en timeout/red (idempotente, el
//   payload no tiene estado); jamás en errores de negocio (llegan en el body
//   SOAP como HTTP 200 y los resuelve el parseo del cliente).

import { XMLParser } from "fast-xml-parser";
import { ArcaError, ARCA_ERROR_CODES } from "./types";

export const SOAP_NS_ENVELOPE = "http://schemas.xmlsoap.org/soap/envelope/";
export const SOAP_NS_FEV1 = "http://ar.gov.afip.dif.FEV1/";
export const WSAA_SOAP_ACTION = "https://wsaa.afip.gov.ar/ws/services/LoginCms";

export const DEFAULT_TIMEOUT_MS = 30_000;
/** 1 intento + 1 retry (solo timeout/red). */
export const MAX_ATTEMPTS = 2;

export const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export const buildSoapEnvelope = (bodyXml: string): string =>
  '<?xml version="1.0" encoding="utf-8"?>' +
  `<soap:Envelope xmlns:soap="${SOAP_NS_ENVELOPE}" ` +
  'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
  'xmlns:xsd="http://www.w3.org/2001/XMLSchema">' +
  `<soap:Body>${bodyXml}</soap:Body>` +
  "</soap:Envelope>";

const parser = new XMLParser({
  ignoreAttributes: true,
  ignoreDeclaration: true,
  parseTagValue: false,
  removeNSPrefix: true,
});

/** Parsea XML SOAP a objeto plano (sin atributos, valores string). */
export const parseXml = (xml: string): Record<string, any> =>
  parser.parse(xml) as Record<string, any>;

export interface SoapRequestInput {
  url: string;
  soapAction: string;
  body: string;
  timeoutMs?: number;
}

const isTimeoutError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === "AbortError";

/** POST SOAP 1.1. Devuelve el XML crudo del body de la respuesta. */
export const soapRequest = async (input: SoapRequestInput): Promise<string> => {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(input.url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml; charset=utf-8",
          SOAPAction: input.soapAction,
        },
        body: input.body,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        throw new ArcaError(
          ARCA_ERROR_CODES.ARCA_NETWORK_ERROR,
          `HTTP ${res.status} al llamar ${input.url}`,
          503,
        );
      }
      return await res.text();
    } catch (err) {
      // Retryable: timeout (AbortError) o fallo de red (TypeError de fetch).
      const retryable = isTimeoutError(err) || err instanceof TypeError;
      lastError = err;
      if (retryable && attempt < MAX_ATTEMPTS) {
        continue;
      }
      if (err instanceof ArcaError) {
        throw err;
      }
      const code = isTimeoutError(err)
        ? ARCA_ERROR_CODES.ARCA_TIMEOUT
        : ARCA_ERROR_CODES.ARCA_NETWORK_ERROR;
      throw new ArcaError(code, String((err as Error)?.message ?? err), 503);
    }
  }

  // Inalcanzable (el retry agota MAX_ATTEMPTS y siempre retorna o lanza).
  throw lastError;
};
