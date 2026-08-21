import fs from "node:fs";
import path from "node:path";
import {
  buildGetPersonaBody,
  getPersona,
  parseGetPersonaResponse,
} from "../../src/integrations/arca/padronClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { ArcaAuthContext, TicketAcceso } from "../../src/integrations/arca/types";

// Fase — cliente del padrón A4 (getPersona). Transporte SOAP y WSAA mockeados;
// parseo REAL con el fixture padron_getPersona_ok.xml. Verifica el mapeo
// tolerante (razón social, IVA id 30, domicilio, constancia).

jest.mock("../../src/integrations/arca/soapClient", () => {
  const actual = jest.requireActual("../../src/integrations/arca/soapClient");
  return { ...actual, soapRequest: jest.fn() };
});
jest.mock("../../src/integrations/arca/wsaaClient", () => ({
  authenticateWsaa: jest.fn(),
}));
import { soapRequest } from "../../src/integrations/arca/soapClient";
import { authenticateWsaa } from "../../src/integrations/arca/wsaaClient";
const soapRequestMock = soapRequest as jest.Mock;
const authenticateWsaaMock = authenticateWsaa as jest.Mock;

const FIXTURES = path.join(__dirname, "..", "fixtures", "arca");
const readFixture = (name: string) => fs.readFileSync(path.join(FIXTURES, name), "utf8");

const TA: TicketAcceso = {
  token: "tk-padron",
  sign: "sg-padron",
  cuit: "30709706701",
  generationTime: new Date("2026-08-18T12:00:00-03:00"),
  expirationTime: new Date("2026-08-19T12:00:00-03:00"),
};

const CONTEXT: ArcaAuthContext = {
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 1,
  environment: "HOMOLOGACION",
  certPath: "/certs/org-1/padron-homo.crt",
  keyPath: "/certs/org-1/padron-homo.key",
};

beforeEach(() => {
  soapRequestMock.mockReset();
  authenticateWsaaMock.mockReset();
  delete process.env.ARCA_PADRON_HOMO_URL;
  delete process.env.ARCA_PADRON_PROD_URL;
});

describe("buildGetPersonaBody", () => {
  it("arma el body getPersona con token/sign/cuitRepresentada/idPersona", () => {
    const body = buildGetPersonaBody(TA, CONTEXT.cuitEmisor, "20000000001");
    expect(body).toContain('xmlns="http://a4.soap.ws.server.puc.sr/"');
    expect(body).toContain("<token xmlns=\"\">tk-padron</token>");
    expect(body).toContain("<sign xmlns=\"\">sg-padron</sign>");
    expect(body).toContain("<cuitRepresentada xmlns=\"\">30709706701</cuitRepresentada>");
    expect(body).toContain("<idPersona xmlns=\"\">20000000001</idPersona>");
  });
});

describe("parseGetPersonaResponse", () => {
  it("mapea persona física (apellido+nombre), IVA 30, domicilio y constancia", () => {
    const persona = parseGetPersonaResponse(readFixture("padron_getPersona_ok.xml"));

    expect(persona.cuit).toBe("20000000001");
    expect(persona.razonSocial).toBe("GOMEZ JUAN CARLOS");
    expect(persona.estado).toBe("ACTIVO");
    expect(persona.impuestos).toEqual([
      { id: 30, descripcion: "IVA", estado: "" },
    ]);
    expect(persona.domicilio).toEqual({
      direccion: "AV CORRIENTES 1234",
      localidad: "CIUDAD AUTONOMA BUENOS AIRES",
      codPostal: "1043",
      provincia: "CIUDAD AUTONOMA BUENOS AIRES",
    });
    expect(persona.constanciaUrl).toBe(
      "https://www.afip.gob.ar/constancia/123",
    );
  });

  it("respuesta sin personaReturn → ArcaError ARCA_PADRON_ERROR", () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope><soap:Body><getPersonaResponse><foo>1</foo></getPersonaResponse></soap:Body></soap:Envelope>';
    let caught: unknown;
    try {
      parseGetPersonaResponse(xml);
    } catch (e: unknown) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArcaError);
    expect((caught as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_PADRON_ERROR);
  });
});

describe("getPersona", () => {
  it("autentica con el service padron y devuelve la persona parseada", async () => {
    authenticateWsaaMock.mockResolvedValue(TA);
    soapRequestMock.mockResolvedValue(readFixture("padron_getPersona_ok.xml"));

    const persona = await getPersona(CONTEXT, "20000000001");

    expect(authenticateWsaaMock).toHaveBeenCalledWith(CONTEXT, "ws_sr_padron_a4");
    expect(soapRequestMock).toHaveBeenCalledTimes(1);
    const call = soapRequestMock.mock.calls[0][0];
    expect(call.url).toBe(
      "https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA4",
    );
    expect(call.soapAction).toBe("");
    expect(persona.cuit).toBe("20000000001");
    expect(persona.razonSocial).toBe("GOMEZ JUAN CARLOS");
  });

  it("CUIT inexistente (sin personaReturn) → ArcaError ARCA_PADRON_NOT_FOUND (404)", async () => {
    authenticateWsaaMock.mockResolvedValue(TA);
    soapRequestMock.mockResolvedValue(
      '<?xml version="1.0"?><soap:Envelope><soap:Body><getPersonaResponse><errors><error><code>1</code></error></errors></getPersonaResponse></soap:Body></soap:Envelope>',
    );

    const error: unknown = await getPersona(CONTEXT, "99999999999").catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(
      ARCA_ERROR_CODES.ARCA_PADRON_NOT_FOUND,
    );
    expect((error as ArcaError).httpStatus).toBe(404);
  });
});
