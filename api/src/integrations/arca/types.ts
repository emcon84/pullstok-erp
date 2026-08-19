// Tipos del dominio ARCA (WSAA + WSFEv1) — sdd/arca-facturacion-electronica.
// La capa de integración expone UNA interfaz (ArcaClient) inyectable y
// mockeable (ArcaClientMock) para que el servicio fiscal (fiscalInvoiceService)
// no dependa de SOAP ni de red. Errores tipificados con código de dominio +
// HTTP status para que los controllers los mapeen sin parsear mensajes.

export type ArcaEnvironment = "HOMOLOGACION" | "PRODUCCION";

/** Ticket de Acceso (TA) devuelto por WSAA LoginCms. */
export interface TicketAcceso {
  token: string;
  sign: string;
  cuit: string;
  generationTime: Date;
  expirationTime: Date;
}

/** Contexto de autenticación de una org: lo que vive en ArcaSetting. */
export interface ArcaAuthContext {
  organizationId: string;
  cuitEmisor: string;
  /** CUIT con autorización del padrón A4 (autocompletar clientes). Si no está
   * presente, el cliente del padrón cae a `cuitEmisor`. */
  padronCuit?: string;
  puntoVenta: number;
  environment: ArcaEnvironment;
  certPath: string;
  keyPath: string;
}

export interface UltimoComprobanteRequest {
  puntoVenta: number;
  tipoCbte: number; // 1=Factura A, 6=Factura B
}

export interface ConsultaComprobanteRequest {
  puntoVenta: number;
  tipoCbte: number;
  cbteNro: number;
}

/** Payload de FECAESolicitar. Montos SIEMPRE en centavos enteros. */
export interface CaeRequest extends UltimoComprobanteRequest {
  cuitEmisor: string;
  cbteNro: number;
  /** YYYYMMDD (fecha del comprobante, America/Argentina/Buenos_Aires). */
  fechaEmision: string;
  importeNeto: number; // centavos (gravado)
  importeExento: number; // centavos (ImpOpEx)
  importeIva: number; // centavos
  importeTotal: number; // centavos
  porAlicuota: { tasa: number; baseImpCents: number; importeCents: number }[];
  docTipoReceptor: number; // 80/96/99
  docNroReceptor: string; // "0" consumidor final
  condicionIvaReceptorId: number; // RG 5616: 1=RI, 5=Consumidor Final
}

export interface ArcaObs {
  code: number;
  msg: string;
}

export interface CaeResult {
  cae: string;
  /** YYYYMMDD */
  caeVencimiento: string;
  resultado: "A" | "C" | "R";
  obs: ArcaObs[];
}

/** Impuesto de una persona del padrón A4 (idImpuesto 30 = IVA). */
export interface PadronImpuesto {
  id: number;
  descripcion: string;
  estado: string;
}

/** Domicilio fiscal devuelto por el padrón A4 (null si no viene). */
export interface PadronDomicilio {
  direccion: string;
  localidad: string;
  codPostal: string;
  provincia: string;
}

/**
 * Persona del padrón A4 (ws_sr_padron_a4 / getPersona). Shape tolerante:
 * `razonSocial` puede venir como persona física (apellido+nombre) o jurídica
 * (razonSocial); `estado` indica si la clave fiscal está vigente.
 */
export interface PadronPersona {
  cuit: string;
  razonSocial: string;
  estado: string;
  impuestos: PadronImpuesto[];
  domicilio: PadronDomicilio | null;
  constanciaUrl: string | null;
}

/** Contrato único de la capa ARCA (composición wsaa + wsfev1 + soap + signer). */
export interface ArcaClient {
  /** WSAA: LoginCms con cache de TA 12 h en memoria por org (MUST NOT persistir). */
  authenticate(): Promise<TicketAcceso>;
  /** FECompUltimoAutorizado: último correlativo autorizado (org, PV, tipoCbte). */
  getLastInvoiceNumber(req: UltimoComprobanteRequest): Promise<number>;
  /** FECAESolicitar: solicita el CAE para el correlativo ya reservado. */
  requestCAE(req: CaeRequest): Promise<CaeResult>;
  /** FECompConsultar: recupera el CAE de un comprobante ya autorizado (null si no existe/no autorizado). */
  consultarComprobante(req: ConsultaComprobanteRequest): Promise<CaeResult | null>;
}

/** Códigos de error tipificados de la capa ARCA (dominio, no mensajes crudos). */
export const ARCA_ERROR_CODES = {
  ARCA_NOT_CONFIGURED: "ARCA_NOT_CONFIGURED",
  ARCA_AUTH_ERROR: "ARCA_AUTH_ERROR",
  ARCA_NETWORK_ERROR: "ARCA_NETWORK_ERROR",
  ARCA_TIMEOUT: "ARCA_TIMEOUT",
  ARCA_PARSE_ERROR: "ARCA_PARSE_ERROR",
  ARCA_REJECTED: "ARCA_REJECTED",
  ARCA_MONTOS_DESCUADRADOS: "ARCA_MONTOS_DESCUADRADOS",
  ARCA_ALREADY_AUTHORIZED: "ARCA_ALREADY_AUTHORIZED",
  INVOICE_NOT_FOUND: "INVOICE_NOT_FOUND",
  INVALID_INVOICE_STATE: "INVALID_INVOICE_STATE",
  INVOICE_ALREADY_ISSUED: "INVOICE_ALREADY_ISSUED",
  CAE_VENCIDO: "CAE_VENCIDO",
  CUIT_INVALIDO: "CUIT_INVALIDO",
  ARCA_PADRON_ERROR: "ARCA_PADRON_ERROR",
  ARCA_PADRON_NOT_FOUND: "ARCA_PADRON_NOT_FOUND",
} as const;

export type ArcaErrorCode =
  (typeof ARCA_ERROR_CODES)[keyof typeof ARCA_ERROR_CODES];

/** Error tipificado: código de dominio + mensaje + HTTP status sugerido. */
export class ArcaError extends Error {
  readonly code: ArcaErrorCode;
  readonly httpStatus: number;

  constructor(code: ArcaErrorCode, message: string, httpStatus = 400) {
    super(message);
    this.name = "ArcaError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}