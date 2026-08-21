import fs from "node:fs";
import path from "node:path";
import {
  authenticateWsaa,
  clearTaCache,
  buildLoginCmsBody,
  parseLoginCmsResponse,
} from "../../src/integrations/arca/wsaaClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { ArcaAuthContext } from "../../src/integrations/arca/types";

// Fase 3 — cliente WSAA (LoginCms + cache de TicketAcceso 12 h en memoria).
// Transporte SOAP y firma mockeados; parseo REAL del fixture loginCms_ok.xml.

jest.mock("../../src/integrations/arca/soapClient", () => {
  const actual = jest.requireActual("../../src/integrations/arca/soapClient");
  return { ...actual, soapRequest: jest.fn() };
});
jest.mock("../../src/integrations/arca/traSigner", () => ({
  buildTra: jest.fn().mockReturnValue("<loginTicketRequest version=\"1.0\"/>"),
  signTra: jest.fn().mockReturnValue("b64-cms-firmado"),
}));
jest.mock("node:fs", () => {
  const actual = jest.requireActual("node:fs");
  return { ...actual, promises: { ...actual.promises, readFile: jest.fn() } };
});

import { soapRequest } from "../../src/integrations/arca/soapClient";
import { signTra } from "../../src/integrations/arca/traSigner";
import { promises as fsPromises } from "node:fs";

const soapRequestMock = soapRequest as jest.Mock;
const readFileMock = fsPromises.readFile as jest.Mock;
const signTraMock = signTra as jest.Mock;

const FIXTURES = path.join(__dirname, "..", "fixtures", "arca");

const CONTEXT: ArcaAuthContext = {
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 1,
  environment: "HOMOLOGACION",
  certPath: "/certs/org-1/wswfev1-homo.crt",
  keyPath: "/certs/org-1/wswfev1-homo.key",
};

beforeEach(() => {
  clearTaCache();
  soapRequestMock.mockReset();
  readFileMock.mockReset();
  signTraMock.mockClear();
  delete process.env.ARCA_WSAA_HOMO_URL;
  delete process.env.ARCA_WSAA_PROD_URL;
});

describe("buildLoginCmsBody", () => {
  it("envuelve el CMS en el namespace del servicio LoginCms", () => {
    const body = buildLoginCmsBody("b64-cms");
    expect(body).toContain('<ns1:loginCms xmlns:ns1="http://wsaa.view.sua.dvadac.desein.afip.gov">');
    expect(body).toContain("b64-cms");
  });
});

describe("parseLoginCmsResponse", () => {
  it("decodifica LoginCmsReturn (base64 con token XML) y devuelve el TicketAcceso", () => {
    const xml = fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8");
    const ta = parseLoginCmsResponse(xml);

    expect(ta.token).toBe("token-homo-1234");
    expect(ta.sign).toBe("sign-homo-abc");
    expect(ta.cuit).toBe("30709706701");
    expect(ta.generationTime).toEqual(new Date("2026-08-18T12:00:00-03:00"));
    expect(ta.expirationTime).toEqual(new Date("2026-08-19T12:00:00-03:00"));
  });

  it("tolera la variante PascalCase (LoginCmsResponse/LoginCmsReturn)", () => {
    const xml = fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8");
    const pascal = xml.replace(/loginCmsResponse/g, "LoginCmsResponse").replace(/loginCmsReturn/g, "LoginCmsReturn");
    const ta = parseLoginCmsResponse(pascal);
    expect(ta.token).toBe("token-homo-1234");
  });

  it("tolera LoginCmsReturn directo en el Body (sin wrapper)", () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope><soap:Body>' +
      "<LoginCmsReturn>PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPGF1dGhTcmM+Cjx0b2tlbj50b2tlbi1ob21vLTEyMzQ8L3Rva2VuPgo8c2lnbj5zaWduLWhvbW8tYWJjPC9zaWduPgo8Y3VpdD4zMDcwOTcwNjcwMTwvY3VpdD4KPGdlbmVyYXRpb25UaW1lPjIwMjYtMDgtMThUMTI6MDA6MDAtMDM6MDA8L2dlbmVyYXRpb25UaW1lPgo8ZXhwaXJhdGlvblRpbWU+MjAyNi0wOC0xOVQxMjowMDowMC0wMzowMDwvZXhwaXJhdGlvblRpbWU+CjwvYXV0aFNyYz4=</LoginCmsReturn>" +
      "</soap:Body></soap:Envelope>";
    const ta = parseLoginCmsResponse(xml);
    expect(ta.token).toBe("token-homo-1234");
  });

  it("LoginCmsReturn inválido (no es XML) → ArcaError ARCA_AUTH_ERROR (502)", () => {
    const xml = "<?xml version=\"1.0\"?><soap:Envelope><soap:Body><LoginCmsResponse><LoginCmsReturn>no-es-base64!!!</LoginCmsReturn></LoginCmsResponse></soap:Body></soap:Envelope>";
    let caught: unknown;
    try {
      parseLoginCmsResponse(xml);
    } catch (e: unknown) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArcaError);
    expect((caught as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_AUTH_ERROR);
  });

  it("fault SOAP de WSAA → ArcaError ARCA_AUTH_ERROR con el faultstring real de AFIP", () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope><soap:Body><soap:Fault>' +
      '<faultcode>ns1:xml.expirationTime.invalid</faultcode>' +
      "<faultstring>expirationTime posee formato o dato inválido (ej: vencimiento en más de 24 horas)</faultstring>" +
      "</soap:Fault></soap:Body></soap:Envelope>";
    let caught: unknown;
    try {
      parseLoginCmsResponse(xml);
    } catch (e: unknown) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ArcaError);
    expect((caught as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_AUTH_ERROR);
    expect((caught as ArcaError).message).toContain(
      "expirationTime posee formato o dato inválido",
    );
  });
});

describe("authenticateWsaa", () => {
  it("lee certificado+clave, firma el TRA y devuelve el TA parseado", async () => {
    readFileMock.mockResolvedValue("pem-cert");
    soapRequestMock.mockResolvedValue(
      fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8"),
    );

    const ta = await authenticateWsaa(CONTEXT);

    expect(readFileMock).toHaveBeenCalledWith(CONTEXT.certPath, "utf8");
    expect(readFileMock).toHaveBeenCalledWith(CONTEXT.keyPath, "utf8");
    expect(signTraMock).toHaveBeenCalledTimes(1);
    expect(soapRequestMock).toHaveBeenCalledTimes(1);
    const call = soapRequestMock.mock.calls[0][0];
    expect(call.url).toBe("https://wsaahomo.afip.gov.ar/ws/services/LoginCms");
    expect(call.soapAction).toBe("https://wsaa.afip.gov.ar/ws/services/LoginCms");
    expect(ta.token).toBe("token-homo-1234");
  });

  it("cachea el TA 12 h por organización: segunda llamada no re-firma ni re-consulta", async () => {
    readFileMock.mockResolvedValue("pem-cert");
    soapRequestMock.mockResolvedValue(
      fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8"),
    );

    // Fijamos la fecha ANTES de la expiración del fixture (loginCms_ok.xml
    // expira 2026-08-19T12:00:00-03:00) para que el TA siga vigente entre
    // ambas llamadas y la segunda reutilice la cache.
    jest.useFakeTimers().setSystemTime(new Date("2026-08-19T10:00:00-03:00"));
    try {
      await authenticateWsaa(CONTEXT);
      await authenticateWsaa(CONTEXT);

      expect(soapRequestMock).toHaveBeenCalledTimes(1);
      expect(signTraMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("la cache es por organización (orgs distintas no comparten TA)", async () => {
    readFileMock.mockResolvedValue("pem-cert");
    soapRequestMock.mockResolvedValue(
      fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8"),
    );

    await authenticateWsaa(CONTEXT);
    await authenticateWsaa({ ...CONTEXT, organizationId: "org-2" });

    expect(soapRequestMock).toHaveBeenCalledTimes(2);
  });

  it("TA vencido → renueva (consulta de nuevo)", async () => {
    readFileMock.mockResolvedValue("pem-cert");
    // loginCms_ok.xml expira 2026-08-19 — los reales vencen en el futuro; con
    // fake timers avanzamos más allá de la expiración para forzar el renew.
    soapRequestMock.mockResolvedValue(
      fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8"),
    );

    jest.useFakeTimers().setSystemTime(new Date("2026-08-19T15:00:00-03:00"));
    try {
      await authenticateWsaa(CONTEXT);
      expect(soapRequestMock).toHaveBeenCalledTimes(1);

      jest.setSystemTime(new Date("2026-08-20T15:00:00-03:00"));
      await authenticateWsaa(CONTEXT);
      expect(soapRequestMock).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it("error de red en LoginCms → ArcaError ARCA_AUTH_ERROR (502) y NO cachea", async () => {
    readFileMock.mockResolvedValue("pem-cert");
    soapRequestMock.mockRejectedValueOnce(
      new ArcaError(ARCA_ERROR_CODES.ARCA_NETWORK_ERROR, "timeout", 503),
    );

    const error: unknown = await authenticateWsaa(CONTEXT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_AUTH_ERROR);
    expect((error as ArcaError).httpStatus).toBe(502);

    // No cacheó: reintento vuelve a consultar
    soapRequestMock.mockResolvedValue(
      fs.readFileSync(path.join(FIXTURES, "loginCms_ok.xml"), "utf8"),
    );
    await authenticateWsaa(CONTEXT);
    expect(soapRequestMock).toHaveBeenCalledTimes(2);
  });

  it("error de lectura de cert/key → ArcaError ARCA_AUTH_ERROR (502)", async () => {
    readFileMock.mockRejectedValue(new Error("ENOENT: no such file"));

    const error: unknown = await authenticateWsaa(CONTEXT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_AUTH_ERROR);
  });
});
