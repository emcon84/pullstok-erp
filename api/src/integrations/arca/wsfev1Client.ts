// Cliente WSFEv1 (ARCA): FECAESolicitar, FECompUltimoAutorizado,
// FECompConsultar. Los montos se reciben SIEMPRE en centavos enteros y se
// serializan a pesos con 2 decimales (string, nunca Float crudo). Errores de
// AFIP mapeados a ArcaError tipificado (dominio, no mensajes): obs 10048 =>
// ARCA_MONTOS_DESCUADRADOS; Errors => ARCA_REJECTED; "ya se encuentra
// registrado" => ARCA_ALREADY_AUTHORIZED (el servicio consulta para recuperar
// el CAE y no duplicar el correlativo).

import { mapAlicuotaId } from "../../services/arcaCalc";
import { buildSoapEnvelope, parseXml, soapRequest, SOAP_NS_FEV1 } from "./soapClient";
import { ArcaError, ARCA_ERROR_CODES } from "./types";
import type {
  ArcaAuthContext,
  ArcaEnvironment,
  ArcaObs,
  CaeRequest,
  CaeResult,
  ConsultaComprobanteRequest,
  TicketAcceso,
  UltimoComprobanteRequest,
} from "./types";

const DEFAULT_WSFEV1_URLS: Record<ArcaEnvironment, string> = {
  HOMOLOGACION: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
  PRODUCCION: "https://servicios1.afip.gov.ar/wsfev1/service.asmx",
};

const resolveWsfeUrl = (environment: ArcaEnvironment): string => {
  if (environment === "PRODUCCION") {
    return process.env.ARCA_WSFEV1_PROD_URL ?? DEFAULT_WSFEV1_URLS.PRODUCCION;
  }
  return process.env.ARCA_WSFEV1_HOMO_URL ?? DEFAULT_WSFEV1_URLS.HOMOLOGACION;
};

/** centavos enteros → pesos con 2 decimales ("242.00"). */
const centsToPesos = (cents: number): string => (cents / 100).toFixed(2);

/** Normaliza NODO → array (AFIP serializa nodo único sin array). */
const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const buildAuthXml = (ta: TicketAcceso): string =>
  "<Auth>" +
  `<Token>${ta.token}</Token>` +
  `<Sign>${ta.sign}</Sign>` +
  `<Cuit>${ta.cuit}</Cuit>` +
  "</Auth>";

const buildAlicuotasXml = (req: CaeRequest): string => {
  const alicuotas = req.porAlicuota.map(
    (a) =>
      "<AlicIva>" +
      `<Id>${mapAlicuotaId(a.tasa)}</Id>` +
      `<BaseImp>${centsToPesos(a.baseImpCents)}</BaseImp>` +
      `<Importe>${centsToPesos(a.importeCents)}</Importe>` +
      "</AlicIva>",
  );
  return alicuotas.length > 0 ? `<Iva>${alicuotas.join("")}</Iva>` : "";
};

/** FECAESolicitar: cabecera (CantReg 1) + detalle del comprobante. */
export const buildFecaeSolicitarBody = (
  ta: TicketAcceso,
  _context: ArcaAuthContext,
  req: CaeRequest,
): string =>
  `<FECAESolicitar xmlns="${SOAP_NS_FEV1}">` +
  buildAuthXml(ta) +
  "<FeCAEReq>" +
  "<FeCabReq>" +
  "<CantReg>1</CantReg>" +
  `<PtoVta>${req.puntoVenta}</PtoVta>` +
  `<CbteTipo>${req.tipoCbte}</CbteTipo>` +
  "</FeCabReq>" +
  "<FeDetReq>" +
  "<FECAEDetRequest>" +
  "<Concepto>1</Concepto>" +
  `<DocTipo>${req.docTipoReceptor}</DocTipo>` +
  `<DocNro>${req.docNroReceptor}</DocNro>` +
  `<CbteDesde>${req.cbteNro}</CbteDesde>` +
  `<CbteHasta>${req.cbteNro}</CbteHasta>` +
  `<CbteFch>${req.fechaEmision}</CbteFch>` +
  `<ImpTotal>${centsToPesos(req.importeTotal)}</ImpTotal>` +
  "<ImpTotConc>0</ImpTotConc>" +
  `<ImpNeto>${centsToPesos(req.importeNeto)}</ImpNeto>` +
  `<ImpOpEx>${centsToPesos(req.importeExento)}</ImpOpEx>` +
  `<ImpIVA>${centsToPesos(req.importeIva)}</ImpIVA>` +
  "<ImpTrib>0</ImpTrib>" +
  "<MonId>PES</MonId>" +
  "<MonCotiz>1</MonCotiz>" +
  buildAlicuotasXml(req) +
  `<CondicionIVAReceptorId>${req.condicionIvaReceptorId}</CondicionIVAReceptorId>` +
  "</FECAEDetRequest>" +
  "</FeDetReq>" +
  "</FeCAEReq>" +
  "</FECAESolicitar>";

export const buildFeCompUltimoAutorizadoBody = (
  ta: TicketAcceso,
  _context: ArcaAuthContext,
  req: UltimoComprobanteRequest,
): string =>
  `<FECompUltimoAutorizado xmlns="${SOAP_NS_FEV1}">` +
  buildAuthXml(ta) +
  `<PtoVta>${req.puntoVenta}</PtoVta>` +
  `<CbteTipo>${req.tipoCbte}</CbteTipo>` +
  "</FECompUltimoAutorizado>";

export const buildFeCompConsultarBody = (
  ta: TicketAcceso,
  _context: ArcaAuthContext,
  req: ConsultaComprobanteRequest,
): string =>
  `<FECompConsultar xmlns="${SOAP_NS_FEV1}">` +
  buildAuthXml(ta) +
  "<FeConsReq>" +
  `<CbteTipo>${req.tipoCbte}</CbteTipo>` +
  `<CbtePtoVta>${req.puntoVenta}</CbtePtoVta>` +
  `<CbteNro>${req.cbteNro}</CbteNro>` +
  "</FeConsReq>" +
  "</FECompConsultar>";

const toObs = (raw: any): ArcaObs => ({
  code: Number(raw?.Code ?? NaN),
  msg: String(raw?.Msg ?? ""),
});

/** Parseo de FECAESolicitar: A → CaeResult; R/C → ArcaError tipificado. */
export const parseFecaeSolicitarResponse = (xml: string): CaeResult => {
  const obj = parseXml(xml);
  const result = obj.Envelope?.Body?.FECAESolicitarResponse?.FECAESolicitarResult;
  if (!result) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_PARSE_ERROR,
      "Respuesta FECAESolicitar sin FECAESolicitarResult",
      502,
    );
  }

  const errors = asArray(result.Errors?.Err);
  const observaciones = asArray(result.Observaciones?.Obs);

  // 1) Errors de AFIP: "ya registrado" (reintento) vs rechazo genérico
  const mensaje = errors.map((e) => `${e.Code} ${e.Msg}`).join("; ");
  if (errors.length > 0) {
    if (/ya (se encuentra )?registrado|ya fue utilizado/i.test(mensaje)) {
      throw new ArcaError(
        ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED,
        `El comprobante ya fue autorizado por AFIP: ${mensaje}`,
        409,
      );
    }
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_REJECTED,
      `AFIP rechazó el comprobante: ${mensaje}`,
      422,
    );
  }

  // 2) Obs 10048: montos descuadrados (se detecta antes que el Resultado R)
  if (observaciones.some((o) => Number(o.Code) === 10048)) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_MONTOS_DESCUADRADOS,
      `AFIP observó montos descuadrados: ${observaciones.map((o) => `${o.Code} ${o.Msg}`).join("; ")}`,
      422,
    );
  }

  // 3) Detalle: Resultado A (CAE), C (observado) o R (rechazado sin errors)
  const det = asArray(result.FeDetResp?.FECAEDetResponse)[0];
  if (det?.Resultado === "A") {
    return {
      cae: String(det.CAE ?? ""),
      caeVencimiento: String(det.CAEFchVto ?? ""),
      resultado: "A",
      obs: observaciones.map(toObs),
    };
  }
  if (det?.Resultado === "C") {
    return { cae: "", caeVencimiento: "", resultado: "C", obs: observaciones.map(toObs) };
  }
  if (det?.Resultado === "R") {
    const obsMsg = observaciones.map((o) => `${o.Code} ${o.Msg}`).join("; ");
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_REJECTED,
      `AFIP rechazó el comprobante${obsMsg ? `: ${obsMsg}` : ""}`,
      422,
    );
  }
  throw new ArcaError(
    ARCA_ERROR_CODES.ARCA_PARSE_ERROR,
    "Respuesta FECAESolicitar sin detalle FECAEDetResponse con Resultado",
    502,
  );
};

export const parseFeCompUltimoAutorizadoResponse = (xml: string): number => {
  const obj = parseXml(xml);
  const value =
    obj.Envelope?.Body?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult;
  if (value === undefined || value === null) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_PARSE_ERROR,
      "Respuesta FECompUltimoAutorizado sin resultado",
      502,
    );
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new ArcaError(
      ARCA_ERROR_CODES.ARCA_PARSE_ERROR,
      `FECompUltimoAutorizado inválido: ${value}`,
      502,
    );
  }
  return n;
};

/** FECompConsultar: null si el comprobante no existe o no está autorizado. */
export const parseFeCompConsultarResponse = (xml: string): CaeResult | null => {
  const obj = parseXml(xml);
  const result = obj.Envelope?.Body?.FECompConsultarResponse?.FECompConsultarResult;
  const rg = result?.ResultGet;
  const errors = asArray(result?.Errors?.Err);
  if (!rg || errors.length > 0) {
    return null;
  }
  return {
    cae: String(rg.CAE ?? ""),
    caeVencimiento: String(rg.CAEFchVto ?? ""),
    resultado: String(rg.Resultado ?? "") as CaeResult["resultado"],
    obs: [],
  };
};

const callWsfe = (
  context: ArcaAuthContext,
  soapAction: string,
  body: string,
): Promise<string> =>
  soapRequest({
    url: resolveWsfeUrl(context.environment),
    soapAction,
    body: buildSoapEnvelope(body),
  });

export const fecaeSolicitar = async (
  context: ArcaAuthContext,
  ta: TicketAcceso,
  req: CaeRequest,
): Promise<CaeResult> => {
  const xml = await callWsfe(
    context,
    `${SOAP_NS_FEV1}FECAESolicitar`,
    buildFecaeSolicitarBody(ta, context, req),
  );
  return parseFecaeSolicitarResponse(xml);
};

export const feCompUltimoAutorizado = async (
  context: ArcaAuthContext,
  ta: TicketAcceso,
  req: UltimoComprobanteRequest,
): Promise<number> => {
  const xml = await callWsfe(
    context,
    `${SOAP_NS_FEV1}FECompUltimoAutorizado`,
    buildFeCompUltimoAutorizadoBody(ta, context, req),
  );
  return parseFeCompUltimoAutorizadoResponse(xml);
};

export const feCompConsultar = async (
  context: ArcaAuthContext,
  ta: TicketAcceso,
  req: ConsultaComprobanteRequest,
): Promise<CaeResult | null> => {
  const xml = await callWsfe(
    context,
    `${SOAP_NS_FEV1}FECompConsultar`,
    buildFeCompConsultarBody(ta, context, req),
  );
  return parseFeCompConsultarResponse(xml);
};
