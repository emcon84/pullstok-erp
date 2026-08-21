// Cliente del Padrón ARCA A4 (ws_sr_padron_a4 / getPersona). Dado un CUIT,
// devuelve los datos fiscales de la persona (razón social, condición de IVA
// vía idImpuesto 30, domicilio, constancia). El TA se obtiene con
// authenticateWsaa(context, "ws_sr_padron_a4") — el service del TRA debe
// coincidir con el WS invocado, por eso NO se reutiliza el TA de "wsfe".
// Parseo tolerante: AFIP puede devolver persona física (apellido+nombre) o
// jurídica (razonSocial) y domicilio/impuestos opcionales.

import { buildSoapEnvelope, parseXml, soapRequest } from "./soapClient";
import { authenticateWsaa } from "./wsaaClient";
import { ArcaError, ARCA_ERROR_CODES } from "./types";
import type {
  ArcaAuthContext,
  ArcaEnvironment,
  PadronPersona,
  TicketAcceso,
} from "./types";

const DEFAULT_PADRON_URLS: Record<ArcaEnvironment, string> = {
  // ARCA (migración 2025): el padrón A4 dejó de estar en
  // /ws/ws_sr_padron_a4/ws_sr_padron_a4.asmx (404). Endpoints vigentes según
  // manual_ws_sr_padron_a4_v1.3 y WSDL real de awshomo.
  HOMOLOGACION:
    "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4",
  PRODUCCION: "https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA4",
};

// Namespace del WSDL real (personaServiceA4): cambió con la migración a ARCA
// (antes http://a4.soap.wsaa.cf.afip.gob.ar/). El SOAPAction del WSDL es "".
const PADRON_SOAP_NS = "http://a4.soap.ws.server.puc.sr/";
const PADRON_SERVICE = "ws_sr_padron_a4";

const resolvePadronUrl = (environment: ArcaEnvironment): string => {
  if (environment === "PRODUCCION") {
    return process.env.ARCA_PADRON_PROD_URL ?? DEFAULT_PADRON_URLS.PRODUCCION;
  }
  return process.env.ARCA_PADRON_HOMO_URL ?? DEFAULT_PADRON_URLS.HOMOLOGACION;
};

/** Normaliza NODO → array (AFIP serializa nodo único sin array). */
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

/** Body SOAP de getPersona: token/sign/cuitRepresentada + idPersona (CUIT).
 * El WSDL de ARCA (personaServiceA4) usa elementFormDefault="unqualified":
 * el wrapper getPersona va en el namespace del servicio pero los hijos van
 * SIN namespace (xmlns=""). Mandarlos con namespace da
 * "Unmarshalling Error: unexpected element". */
export const buildGetPersonaBody = (
  ta: TicketAcceso,
  cuitRepresentada: string,
  idPersona: string,
): string =>
  `<getPersona xmlns="${PADRON_SOAP_NS}">` +
  `<token xmlns="">${ta.token}</token>` +
  `<sign xmlns="">${ta.sign}</sign>` +
  `<cuitRepresentada xmlns="">${cuitRepresentada}</cuitRepresentada>` +
  `<idPersona xmlns="">${idPersona}</idPersona>` +
  "</getPersona>";

const asText = (value: unknown): string =>
  value === undefined || value === null ? "" : String(value);

/**
 * Mapeo tolerante del XML de respuesta getPersona a PadronPersona.
 * - razón social: apellido+nombre (física) o razonSocial (jurídica).
 * - impuesto idImpuesto 30 = IVA; su descripcion/estado dan la condición.
 * - domicilio/constancia: opcionales (null si no vienen).
 */
export const parseGetPersonaResponse = (xml: string): PadronPersona => {
  const obj = parseXml(xml);
  const raw =
    obj.Envelope?.Body?.getPersonaResponse?.personaReturn ??
    obj.Envelope?.Body?.GetPersonaResponse?.GetPersonaResult ??
    obj.Envelope?.Body?.getPersonaResponse?.GetPersonaResult;

  if (!raw) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_PADRON_ERROR,
      "Respuesta del padrón sin personaReturn",
      502,
    );
  }

  const idPersona = asText(raw.idPersona);
  const apellido = asText(raw.apellido);
  const nombre = asText(raw.nombre);
  const razonSocial = asText(raw.razonSocial);
  const displayName =
    razonSocial || [apellido, nombre].filter(Boolean).join(" ") || "";

  const impuestos = asArray(raw.impuesto?.impuesto).map((imp) => ({
    id: Number(imp?.idImpuesto ?? NaN),
    descripcion: asText(imp?.descripcionImpuesto),
    estado: asText(imp?.estado ?? imp?.descripcion ?? ""),
  }));

  const dom = raw.domicilio;
  const domicilio =
    dom && (dom.direccion || dom.localidad || dom.descripcionProvincia)
      ? {
          direccion: asText(dom.direccion),
          localidad: asText(dom.localidad),
          codPostal: asText(dom.codPostal),
          provincia: asText(dom.descripcionProvincia),
        }
      : null;

  return {
    cuit: idPersona,
    razonSocial: displayName,
    estado: asText(raw.estadoClave),
    impuestos,
    domicilio,
    constanciaUrl: asText(raw.constancia) || null,
  };
};

/** Consulta el padrón A4 de un CUIT. Lanza ArcaError si falla o no existe. */
export const getPersona = async (
  context: ArcaAuthContext,
  cuit: string,
): Promise<PadronPersona> => {
  const ta = await authenticateWsaa(context, PADRON_SERVICE);
  // El padrón A4 se consulta con el CUIT que tiene la autorización del
  // servicio (padronCuit). Si no está configurado, cae al cuitEmisor.
  const cuitRepresentada = context.padronCuit ?? context.cuitEmisor;
  let xml: string;
  try {
    xml = await soapRequest({
      url: resolvePadronUrl(context.environment),
      soapAction: "",
      body: buildSoapEnvelope(
        buildGetPersonaBody(ta, cuitRepresentada, cuit),
      ),
    });
  } catch (err) {
    // AFIP responde CUIT inexistente como fault SOAP con HTTP 500
    // ("No existe persona con ese Id"). Mapear a 404 para el front.
    if (
      err instanceof ArcaError &&
      err.code === ARCA_ERROR_CODES.ARCA_NETWORK_ERROR &&
      /no existe persona|persona con ese id/i.test(err.message)
    ) {
      throw new ArcaError(
        ARCA_ERROR_CODES.ARCA_PADRON_NOT_FOUND,
        "El CUIT no existe en el padrón de ARCA o no tiene datos públicos",
        404,
      );
    }
    throw err;
  }

  const obj = parseXml(xml);
  const raw =
    obj.Envelope?.Body?.getPersonaResponse?.personaReturn ??
    obj.Envelope?.Body?.GetPersonaResponse?.GetPersonaResult ??
    obj.Envelope?.Body?.getPersonaResponse?.GetPersonaResult;

  // CUIT inexistente: AFIP responde con error en el body (HTTP 200) o
  // personaReturn vacío. Mapeamos a ARCA_PADRON_NOT_FOUND (404).
  if (!raw) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_PADRON_NOT_FOUND,
      "El CUIT no existe en el padrón de ARCA o no tiene datos públicos",
      404,
    );
  }

  return parseGetPersonaResponse(xml);
};
