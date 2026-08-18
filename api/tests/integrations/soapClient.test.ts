import {
  buildSoapEnvelope,
  parseXml,
  soapRequest,
  xmlEscape,
} from "../../src/integrations/arca/soapClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";

// Fase 3 — transporte SOAP: envelope XML, parseo con fast-xml-parser v5 y
// política de reintento (1 retry SOLO en timeout/red; nunca en negocio).

describe("buildSoapEnvelope", () => {
  it("envuelve el body en soap:Envelope/soap:Body con namespaces estándar", () => {
    const envelope = buildSoapEnvelope("<foo>1</foo>");
    expect(envelope).toContain('<?xml version="1.0"');
    expect(envelope).toContain("<soap:Envelope");
    expect(envelope).toContain('xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"');
    expect(envelope).toContain("<soap:Body><foo>1</foo></soap:Body>");
    expect(envelope).toContain("</soap:Envelope>");
  });
});

describe("xmlEscape", () => {
  it("escapa caracteres XML reservados", () => {
    expect(xmlEscape('a<b&c>"d\'')).toBe("a&lt;b&amp;c&gt;&quot;d&apos;");
  });
});

describe("parseXml", () => {
  it("parsea XML plano a objeto (sin atributos, valores como string)", () => {
    const obj = parseXml("<resp><Code>10048</Code><Ok>true</Ok></resp>");
    expect(obj.resp.Code).toBe("10048");
    expect(obj.resp.Ok).toBe("true");
  });

  it("respeta el case exacto de los tags de AFIP (FeCabResp, FECAEDetResponse)", () => {
    const obj = parseXml(
      "<FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp></FECAESolicitarResult>",
    );
    expect(obj.FECAESolicitarResult.FeCabResp.Resultado).toBe("A");
  });
});

describe("soapRequest", () => {
  const xmlOk =
    '<?xml version="1.0"?><soap:Envelope><soap:Body><R>ok</R></soap:Body></soap:Envelope>';

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const mockFetch = (impl: (...args: Parameters<typeof fetch>) => unknown) => {
    const fn = jest.fn(impl) as jest.MockedFunction<typeof fetch>;
    globalThis.fetch = fn;
    return fn;
  };

  it("POSTea al endpoint con headers SOAP y devuelve el body crudo", async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(new Response(xmlOk, { status: 200, headers: { "content-type": "text/xml" } })),
    );

    const body = await soapRequest({
      url: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
      soapAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      body: "<foo/>",
    });

    expect(body).toBe(xmlOk);
    const [input, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(input).toBe("https://wswhomo.afip.gov.ar/wsfev1/service.asmx");
    expect((init.headers as Record<string, string>)["Content-Type"]).toContain("text/xml");
    expect((init.headers as Record<string, string>).SOAPAction).toBe(
      "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
    );
    expect(String(init.body)).toContain("<foo/>");
    expect(init.signal).toBeDefined(); // timeout aplicado
  });

  it("timeout (AbortError) → reintenta UNA vez con el mismo body y devuelve el 2do intento", async () => {
    const fetchMock = mockFetch(() =>
      Promise.reject(new DOMException("The operation was aborted", "AbortError")),
    );
    // 1er intento: timeout; retry: éxito
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new DOMException("The operation was aborted", "AbortError")),
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response(xmlOk, { status: 200 })),
    );

    const body = await soapRequest({
      url: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
      soapAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      body: "<foo/>",
    });

    expect(body).toBe(xmlOk);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    const secondBody = String((fetchMock.mock.calls[1][1] as RequestInit).body);
    expect(secondBody).toBe(firstBody); // mismo payload (idempotente: no hay estado)
  });

  it("red caída (TypeError) → reintenta y si vuelve a fallar → ArcaError ARCA_NETWORK_ERROR (503)", async () => {
    const fetchMock = mockFetch(() =>
      Promise.reject(new TypeError("fetch failed")),
    );

    const error = await soapRequest({
      url: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
      soapAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      body: "<foo/>",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_NETWORK_ERROR);
    expect((error as ArcaError).httpStatus).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP 500 (transporte) → ArcaError ARCA_NETWORK_ERROR (503) sin reintento extra", async () => {
    const fetchMock = mockFetch(() =>
      Promise.resolve(new Response("boom", { status: 500 })),
    );

    const error = await soapRequest({
      url: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
      soapAction: "http://ar.gov.afip.dif.FEV1/FECAESolicitar",
      body: "<foo/>",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_NETWORK_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
