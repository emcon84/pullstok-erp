import { ArcaClientMock } from "../../src/integrations/arca/mockArcaClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { CaeRequest } from "../../src/integrations/arca/types";

// Fase 3 — ArcaClientMock: doble inyectable para que fiscalInvoiceService
// (Fase 4) no dependa de red. La cache de TA del mock es NOOP (no autentica).

describe("ArcaClientMock", () => {
  const REQ: CaeRequest = {
    puntoVenta: 1,
    tipoCbte: 6,
    cuitEmisor: "30709706701",
    cbteNro: 12,
    fechaEmision: "20260818",
    importeNeto: 20000,
    importeExento: 0,
    importeIva: 4200,
    importeTotal: 24200,
    porAlicuota: [{ tasa: 21, baseImpCents: 20000, importeCents: 4200 }],
    docTipoReceptor: 99,
    docNroReceptor: "0",
    condicionIvaReceptorId: 5,
  };

  it("authenticate devuelve un TA válido sin red (cache NOOP)", async () => {
    const client = new ArcaClientMock();
    const ta = await client.authenticate();
    expect(ta.token).toContain("token");
    expect(ta.expirationTime.getTime()).toBeGreaterThan(Date.now());
  });

  it("getLastInvoiceNumber devuelve el correlativo configurado", async () => {
    const client = new ArcaClientMock();
    client.lastNumber = 12;
    await expect(
      client.getLastInvoiceNumber({ puntoVenta: 1, tipoCbte: 6 }),
    ).resolves.toBe(12);
  });

  it("requestCAE devuelve el CaeResult configurado (CAE + vencimiento)", async () => {
    const client = new ArcaClientMock();
    client.nextCaeResult = {
      cae: "72431470192419",
      caeVencimiento: "20260825",
      resultado: "A",
      obs: [],
    };

    const result = await client.requestCAE(REQ);

    expect(result.cae).toBe("72431470192419");
    expect(result.caeVencimiento).toBe("20260825");
  });

  it("registra el último CaeRequest para que el servicio pueda verificar el correlativo reutilizado", async () => {
    const client = new ArcaClientMock();
    await client.requestCAE(REQ);
    expect(client.lastCaeRequest).toEqual(REQ);
  });

  it("failNextRequestCAE inyecta un ArcaError (simula rechazo de AFIP)", async () => {
    const client = new ArcaClientMock();
    client.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_REJECTED,
      "10007 rechazado",
      422,
    );

    const error = await client.requestCAE(REQ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ArcaError);
    expect((error as ArcaError).code).toBe(ARCA_ERROR_CODES.ARCA_REJECTED);
  });

  it("consultarComprobante devuelve el resultado del último requestCAE o null", async () => {
    const client = new ArcaClientMock();
    client.nextCaeResult = {
      cae: "72431470192419",
      caeVencimiento: "20260825",
      resultado: "A",
      obs: [],
    };
    await client.requestCAE(REQ);

    const consulted = await client.consultarComprobante({
      puntoVenta: 1,
      tipoCbte: 6,
      cbteNro: 12,
    });
    expect(consulted).not.toBeNull();
    expect(consulted!.cae).toBe("72431470192419");

    // Comprobante distinto → null (no existe)
    const missing = await client.consultarComprobante({
      puntoVenta: 1,
      tipoCbte: 6,
      cbteNro: 999,
    });
    expect(missing).toBeNull();
  });

  it("contador de llamadas para asserts del servicio", async () => {
    const client = new ArcaClientMock();
    await client.getLastInvoiceNumber({ puntoVenta: 1, tipoCbte: 6 });
    await client.requestCAE(REQ);
    expect(client.calls).toEqual({
      authenticate: 0,
      getLastInvoiceNumber: 1,
      requestCAE: 1,
      consultarComprobante: 0,
    });
  });
});
