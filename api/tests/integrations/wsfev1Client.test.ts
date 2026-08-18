import fs from "node:fs";
import path from "node:path";
import {
  buildFecaeSolicitarBody,
  buildFeCompUltimoAutorizadoBody,
  buildFeCompConsultarBody,
  fecaeSolicitar,
  feCompUltimoAutorizado,
  feCompConsultar,
} from "../../src/integrations/arca/wsfev1Client";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { ArcaAuthContext, CaeRequest, TicketAcceso } from "../../src/integrations/arca/types";

// Fase 3 — cliente WSFEv1 (FECAESolicitar / FECompUltimoAutorizado /
// FECompConsultar). Transporte SOAP mockeado; parseo REAL con los fixtures
// XML. Verifica el mapeo de errores ARCA (dominio tipificado, no mensajes).

jest.mock("../../src/integrations/arca/soapClient", () => {
  const actual = jest.requireActual("../../src/integrations/arca/soapClient");
  return { ...actual, soapRequest: jest.fn() };
});
import { soapRequest } from "../../src/integrations/arca/soapClient";
const soapRequestMock = soapRequest as jest.Mock;

const FIXTURES = path.join(__dirname, "..", "fixtures", "arca");
const readFixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const TA: TicketAcceso = {
  token: "tk-homo-1",
  sign: "sg-homo-1",
  cuit: "30709706701",
  generationTime: new Date("2026-08-18T12:00:00-03:00"),
  expirationTime: new Date("2026-08-19T12:00:00-03:00"),
};

const CONTEXT: ArcaAuthContext = {
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 1,
  environment: "HOMOLOGACION",
  certPath: "/certs/org-1/wswfev1-homo.crt",
  keyPath: "/certs/org-1/wswfev1-homo.key",
};

const REQ: CaeRequest = {
  puntoVenta: 1,
  tipoCbte: 6, // Factura B
  cuitEmisor: "30709706701",
  cbteNro: 12,
  fechaEmision: "20260818",
  importeNeto: 20000, // centavos → 200.00
  importeExento: 0,
  importeIva: 4200, // centavos → 42.00
  importeTotal: 24200, // centavos → 242.00
  porAlicuota: [{ tasa: 21, baseImpCents: 20000, importeCents: 4200 }],
  docTipoReceptor: 99,
  docNroReceptor: "0",
  condicionIvaReceptorId: 5,
};

beforeEach(() => {
  soapRequestMock.mockReset();
  delete process.env.ARCA_WSFEV1_HOMO_URL;
  delete process.env.ARCA_WSFEV1_PROD_URL;
});

describe("buildFecaeSolicitarBody", () => {
  it("arma el body FECAESolicitar con Auth, cabecera y detalle en centavos→pesos", () => {
    const body = buildFecaeSolicitarBody(TA, CONTEXT, REQ);

    // Auth del TA
    expect(body).toContain("<Token>tk-homo-1</Token>");
    expect(body).toContain("<Sign>sg-homo-1</Sign>");
    expect(body).toContain("<Cuit>30709706701</Cuit>");

    // Cabecera
    expect(body).toContain("<CantReg>1</CantReg>");
    expect(body).toContain("<PtoVta>1</PtoVta>");
    expect(body).toContain("<CbteTipo>6</CbteTipo>");

    // Detalle: montos en pesos con 2 decimales (string), nunca flotantes crudos
    expect(body).toContain("<CbteDesde>12</CbteDesde>");
    expect(body).toContain("<CbteHasta>12</CbteHasta>");
    expect(body).toContain("<CbteFch>20260818</CbteFch>");
    expect(body).toContain("<ImpTotal>242.00</ImpTotal>");
    expect(body).toContain("<ImpTotConc>0</ImpTotConc>");
    expect(body).toContain("<ImpNeto>200.00</ImpNeto>");
    expect(body).toContain("<ImpOpEx>0.00</ImpOpEx>");
    expect(body).toContain("<ImpIVA>42.00</ImpIVA>");
    expect(body).toContain("<ImpTrib>0</ImpTrib>");
    expect(body).toContain("<MonId>PES</MonId>");
    expect(body).toContain("<MonCotiz>1</MonCotiz>");

    // Alicuotas y condición del receptor
    expect(body).toContain("<AlicIva>");
    expect(body).toContain("<Id>5</Id>");
    expect(body).toContain("<BaseImp>200.00</BaseImp>");
    expect(body).toContain("<Importe>42.00</Importe>");
    expect(body).toContain("<CondicionIVAReceptorId>5</CondicionIVAReceptorId>");
    expect(body).toContain("<DocTipo>99</DocTipo>");
    expect(body).toContain("<DocNro>0</DocNro>");
    expect(body).toContain("<Concepto>1</Concepto>");
  });

  it("con una sola alicuota no genera AlicIva adicional (array de 1 elemento)", () => {
    const body = buildFecaeSolicitarBody(TA, CONTEXT, REQ);
    const alicuotas = body.match(/<AlicIva>/g);
    expect(alicuotas).toHaveLength(1);
  });

  it("sin alicuotas (solo exento) no incluye AlicIva", () => {
    const body = buildFecaeSolicitarBody(TA, CONTEXT, {
      ...REQ,
      importeNeto: 0,
      importeIva: 0,
      porAlicuota: [],
    });
    expect(body).not.toContain("<AlicIva>");
  });
});

describe("fecaeSolicitar", () => {
  it("parsea la respuesta OK y devuelve CaeResult (Resultado A + CAE + vencimiento)", async () => {
    soapRequestMock.mockResolvedValue(readFixture("fecaeSolicitar_ok.xml"));

    const result = await fecaeSolicitar(CONTEXT, TA, REQ);

    expect(result.resultado).toBe("A");
    expect(result.cae).toBe("72431470192419");
    expect(result.caeVencimiento).toBe("20260825");
    expect(result.obs).toEqual([]);

    // Llamada SOAP: URL homo por defecto + SOAPAction correcta
    expect(soapRequestMock).toHaveBeenCalledTimes(1);
    const call = soapRequestMock.mock.calls[0][0];
    expect(call.url).toBe("https://wswhomo.afip.gov.ar/wsfev1/service.asmx");
    expect(call.soapAction).toBe("http://ar.gov.afip.dif.FEV1/FECAESolicitar");
  });

  it("respuesta R con obs 10048 → ArcaError ARCA_MONTOS_DESCUADRADOS (422)", async () => {
    soapRequestMock.mockResolvedValue(readFixture("fecaeSolicitar_obs10048.xml"));

    const error = await fecaeSolicitar(CONTEXT, TA, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_MONTOS_DESCUADRADOS);
    expect((error as ArcaError).httpStatus).toBe(422);
    expect(String((error as ArcaError).message)).toContain("10048");
  });

  it("respuesta R con Errors → ArcaError ARCA_REJECTED con code y msg de AFIP (422)", async () => {
    soapRequestMock.mockResolvedValue(readFixture("fecaeSolicitar_rechazo.xml"));

    const error = await fecaeSolicitar(CONTEXT, TA, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_REJECTED);
    expect((error as ArcaError).httpStatus).toBe(422);
    expect(String((error as ArcaError).message)).toContain("10007");
    expect(String((error as ArcaError).message)).toContain("El concepto 0 no es valido");
  });

  it("error 'comprobante ya registrado' → ArcaError ARCA_ALREADY_AUTHORIZED (409)", async () => {
    soapRequestMock.mockResolvedValue(readFixture("fecaeSolicitar_yaAutorizado.xml"));

    const error = await fecaeSolicitar(CONTEXT, TA, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED);
    expect((error as ArcaError).httpStatus).toBe(409);
  });

  it("respuesta sin CAE → ArcaError ARCA_PARSE_ERROR (502)", async () => {
    soapRequestMock.mockResolvedValue(
      "<?xml version=\"1.0\"?><soap:Envelope><soap:Body><FECAESolicitarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECAESolicitarResult></FECAESolicitarResult></FECAESolicitarResponse></soap:Body></soap:Envelope>",
    );

    const error = await fecaeSolicitar(CONTEXT, TA, REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_PARSE_ERROR);
    expect((error as ArcaError).httpStatus).toBe(502);
  });

  it("propaga ArcaError de transporte (red/timeout) sin mapearlos a otro código", async () => {
    const transportError = new ArcaError(
      ARCA_ERROR_CODES.ARCA_NETWORK_ERROR,
      "ECONNRESET",
      503,
    );
    soapRequestMock.mockRejectedValue(transportError);

    const error = await fecaeSolicitar(CONTEXT, TA, REQ).catch((e: unknown) => e);
    expect(error).toBe(transportError);
  });
});

describe("feCompUltimoAutorizado", () => {
  it("devuelve el último correlativo autorizado como número", async () => {
    soapRequestMock.mockResolvedValue(readFixture("feCompUltimoAutorizado_ok.xml"));

    const result = await feCompUltimoAutorizado(CONTEXT, TA, {
      puntoVenta: 1,
      tipoCbte: 6,
    });

    expect(result).toBe(12);
    const call = soapRequestMock.mock.calls[0][0];
    expect(call.soapAction).toBe("http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado");
    expect(call.body).toContain("<CbteTipo>6</CbteTipo>");
    expect(call.body).toContain("<PtoVta>1</PtoVta>");
  });

  it("buildFeCompUltimoAutorizadoBody lleva Auth + PtoVta + CbteTipo", () => {
    const body = buildFeCompUltimoAutorizadoBody(TA, CONTEXT, { puntoVenta: 1, tipoCbte: 6 });
    expect(body).toContain("<Auth>");
    expect(body).toContain("<Token>tk-homo-1</Token>");
    expect(body).toContain("<PtoVta>1</PtoVta>");
    expect(body).toContain("<CbteTipo>6</CbteTipo>");
  });
});

describe("feCompConsultar", () => {
  it("devuelve el CaeResult del comprobante consultado", async () => {
    soapRequestMock.mockResolvedValue(readFixture("feCompConsultar_ok.xml"));

    const result = await feCompConsultar(CONTEXT, TA, {
      puntoVenta: 1,
      tipoCbte: 6,
      cbteNro: 12,
    });

    expect(result).not.toBeNull();
    expect(result!.cae).toBe("72431470192419");
    expect(result!.resultado).toBe("A");
  });

  it("sin ResultGet (comprobante inexistente) → null", async () => {
    soapRequestMock.mockResolvedValue(
      "<?xml version=\"1.0\"?><soap:Envelope><soap:Body><FECompConsultarResponse xmlns=\"http://ar.gov.afip.dif.FEV1/\"><FECompConsultarResult></FECompConsultarResult></FECompConsultarResponse></soap:Body></soap:Envelope>",
    );

    const result = await feCompConsultar(CONTEXT, TA, {
      puntoVenta: 1,
      tipoCbte: 6,
      cbteNro: 999,
    });
    expect(result).toBeNull();
  });

  it("buildFeCompConsultarBody lleva Auth + PtoVta + CbteTipo + CbteNro", () => {
    const body = buildFeCompConsultarBody(TA, CONTEXT, { puntoVenta: 1, tipoCbte: 6, cbteNro: 12 });
    expect(body).toContain("<Auth>");
    expect(body).toContain("<CbtePtoVta>1</CbtePtoVta>");
    expect(body).toContain("<CbteTipo>6</CbteTipo>");
    expect(body).toContain("<CbteNro>12</CbteNro>");
  });
});
