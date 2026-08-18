// ArcaClientMock: doble en memoria de la interfaz ArcaClient para que el
// servicio fiscal y los e2e no dependan de red/certificados. Configurable
// (correlativo, CaeResult, fallo inyectado) y observable (calls, último
// request) para asserts del orquestador. La cache de TA es NOOP: authenticate
// devuelve un TA sintético sin llamar a WSAA.

import { ArcaError } from "./types";
import type {
  ArcaClient,
  CaeRequest,
  CaeResult,
  ConsultaComprobanteRequest,
  TicketAcceso,
  UltimoComprobanteRequest,
} from "./types";

const TA_MOCK: TicketAcceso = {
  token: "token-mock",
  sign: "sign-mock",
  cuit: "30709706701",
  generationTime: new Date(),
  expirationTime: new Date(Date.now() + 12 * 3600 * 1000),
};

export class ArcaClientMock implements ArcaClient {
  /** Último correlativo autorizado (respuesta de FECompUltimoAutorizado). */
  lastNumber = 12;

  /** Resultado a devolver en el próximo requestCAE (Resultado A por defecto). */
  nextCaeResult: CaeResult = {
    cae: "72431470192419",
    caeVencimiento: "20260825",
    resultado: "A",
    obs: [],
  };

  /** Si está seteado, el próximo requestCAE falla con este ArcaError. */
  failNextRequestCAE: ArcaError | null = null;

  calls = {
    authenticate: 0,
    getLastInvoiceNumber: 0,
    requestCAE: 0,
    consultarComprobante: 0,
  };

  lastCaeRequest: CaeRequest | null = null;
  lastConsultado: ConsultaComprobanteRequest | null = null;

  async authenticate(): Promise<TicketAcceso> {
    this.calls.authenticate++;
    return TA_MOCK;
  }

  async getLastInvoiceNumber(
    _req: UltimoComprobanteRequest,
  ): Promise<number> {
    this.calls.getLastInvoiceNumber++;
    return this.lastNumber;
  }

  async requestCAE(req: CaeRequest): Promise<CaeResult> {
    this.calls.requestCAE++;
    this.lastCaeRequest = req;
    if (this.failNextRequestCAE) {
      const error = this.failNextRequestCAE;
      this.failNextRequestCAE = null; // falla una sola vez
      throw error;
    }
    return this.nextCaeResult;
  }

  async consultarComprobante(
    req: ConsultaComprobanteRequest,
  ): Promise<CaeResult | null> {
    this.calls.consultarComprobante++;
    this.lastConsultado = req;
    if (
      this.lastCaeRequest &&
      req.puntoVenta === this.lastCaeRequest.puntoVenta &&
      req.tipoCbte === this.lastCaeRequest.tipoCbte &&
      req.cbteNro === this.lastCaeRequest.cbteNro
    ) {
      return this.nextCaeResult;
    }
    return null;
  }
}

/** Factory por convención de los tests del servicio fiscal. */
export const createArcaClientMock = (): ArcaClientMock => new ArcaClientMock();
