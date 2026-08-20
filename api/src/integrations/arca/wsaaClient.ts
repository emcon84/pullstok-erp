// Cliente WSAA (LoginCms): obtiene el TicketAcceso (TA) firmando el TRA con el
// certificado de la org. Cache del TA en memoria 12 h por organización.
// MUY IMPORTANTE (spec arca-wsaa-auth): el TA NUNCA se persiste en DB ni en
// disco — solo vive en el Map de proceso. Error de WSAA => ArcaError
// ARCA_AUTH_ERROR (502) con mensaje claro, sin cachear.

import { promises as fs } from "node:fs";
import { buildTra, signTra } from "./traSigner";
import { buildSoapEnvelope, parseXml, soapRequest, WSAA_SOAP_ACTION } from "./soapClient";
import { ArcaError, ARCA_ERROR_CODES } from "./types";
import type { ArcaAuthContext, ArcaEnvironment, TicketAcceso } from "./types";

const DEFAULT_WSAA_URLS: Record<ArcaEnvironment, string> = {
  HOMOLOGACION: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
  PRODUCCION: "https://wsaa.afip.gov.ar/ws/services/LoginCms",
};

/** Vida útil del TA en cache: 12 h (el TA real expira antes, se respeta). */
const TA_MAX_CACHE_MS = 12 * 3600 * 1000;

interface TaCacheEntry {
  ta: TicketAcceso;
  expiresAt: number;
}

/** Cache en memoria por `${organizationId}:${service}` (MUST NOT persistir).
 * Un TA es válido SOLO para el service del TRA que lo firmó: el de "wsfe" NO
 * sirve para "ws_sr_padron_a4". */
const taCache = new Map<string, TaCacheEntry>();

export const clearTaCache = (): void => {
  taCache.clear();
};

const resolveWsaaUrl = (environment: ArcaEnvironment): string => {
  if (environment === "PRODUCCION") {
    return process.env.ARCA_WSAA_PROD_URL ?? DEFAULT_WSAA_URLS.PRODUCCION;
  }
  return process.env.ARCA_WSAA_HOMO_URL ?? DEFAULT_WSAA_URLS.HOMOLOGACION;
};

/** Body de LoginCms: namespace del servicio + CMS firmado en in0.
 * La operación SOAP correcta es `loginCms` (así lo define el WSDL
 * https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl); usar
 * `loginTicketRequest` devuelve "No such operation 'loginTicketRequest'". */
export const buildLoginCmsBody = (cmsBase64: string): string =>
  '<ns1:loginCms xmlns:ns1="http://wsaa.view.sua.dvadac.desein.afip.gov">' +
  `<ns1:in0>${cmsBase64}</ns1:in0>` +
  "</ns1:loginCms>";

/** Decodifica LoginCmsReturn (base64 con token XML) y devuelve el TA. */
export const parseLoginCmsResponse = (xml: string): TicketAcceso => {
  try {
    const obj = parseXml(xml);

    // Si WSAA devuelve un fault SOAP (p.ej. xml.expirationTime.invalid,
    // coe.alreadyAuthenticated), reportar el faultstring real de AFIP en vez
    // de un mensaje genérico que oscurece la causa.
    const fault = obj.Envelope?.Body?.Fault;
    if (fault) {
      const code = fault.faultcode ?? "desconocido";
      const message = fault.faultstring ?? String(fault.detail ?? "");
      throw new Error(`WSAA fault ${code}: ${message}`);
    }

    const b64 = obj.Envelope?.Body?.LoginCmsResponse?.LoginCmsReturn;
    if (!b64) {
      throw new Error("LoginCmsReturn ausente en la respuesta");
    }
    const tokenXml = Buffer.from(String(b64), "base64").toString("utf8");
    const root = parseXml(tokenXml).authSrc;
    if (!root?.token || !root?.sign || !root?.cuit) {
      throw new Error("token XML sin token/sign/cuit");
    }
    return {
      token: String(root.token),
      sign: String(root.sign),
      cuit: String(root.cuit),
      generationTime: new Date(String(root.generationTime)),
      expirationTime: new Date(String(root.expirationTime)),
    };
  } catch (err) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_AUTH_ERROR,
      `No se pudo parsear la respuesta de WSAA: ${(err as Error).message}`,
      502,
    );
  }
};

const isCacheable = (entry: TaCacheEntry): boolean =>
  entry.expiresAt > Date.now() &&
  entry.ta.expirationTime.getTime() > Date.now();

/** Obtiene (y cachea) el TA de la org para el service pedido. Renueva si está
 * vencido o faltan <0 ms. El service del TRA debe coincidir con el WS que se
 * va a invocar (el TA es por service: "wsfe" ≠ "ws_sr_padron_a4"). */
export const authenticateWsaa = async (
  context: ArcaAuthContext,
  service = "wsfe",
): Promise<TicketAcceso> => {
  const cacheKey = `${context.organizationId}:${service}`;
  const cached = taCache.get(cacheKey);
  if (cached && isCacheable(cached)) {
    return cached.ta;
  }

  try {
    const [certPem, keyPem] = await Promise.all([
      fs.readFile(context.certPath, "utf8"),
      fs.readFile(context.keyPath, "utf8"),
    ]);

    const tra = buildTra(context.cuitEmisor, service);
    const cms = signTra(tra, certPem, keyPem);

    const xml = await soapRequest({
      url: resolveWsaaUrl(context.environment),
      soapAction: WSAA_SOAP_ACTION,
      body: buildSoapEnvelope(buildLoginCmsBody(cms)),
    });

    const ta = parseLoginCmsResponse(xml);
    const expiresAt = Math.min(
      ta.expirationTime.getTime(),
      Date.now() + TA_MAX_CACHE_MS,
    );
    taCache.set(cacheKey, { ta, expiresAt });
    return ta;
  } catch (err) {
    if (err instanceof ArcaError) {
      if (err.code === ARCA_ERROR_CODES.ARCA_AUTH_ERROR) {
        throw err;
      }
      // Transporte/parseo de WSAA se reporta como error de autenticación
      throw new ArcaError(
        ARCA_ERROR_CODES.ARCA_AUTH_ERROR,
        `Error WSAA: ${err.message}`,
        502,
      );
    }
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_AUTH_ERROR,
      `Error WSAA: ${(err as Error).message}`,
      502,
    );
  }
};
