import { prisma, basePrisma } from "../../src/config/db";
import {
  emitirFiscalmente,
  reintentarFiscalmente,
  resolvePuntoVenta,
} from "../../src/services/fiscalInvoiceService";
import {
  ArcaClientMock,
  createArcaClientMock,
} from "../../src/integrations/arca/mockArcaClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";
import type { ArcaAuthContext } from "../../src/integrations/arca/types";

// Mocks: config/db (prisma tenant + basePrisma sin scope) y tenantContext
// (org fija). ArcaClientMock es un doble REAL en memoria (no se mockea) para
// observar el flujo SOAP y el correlativo sin red.
jest.mock("../../src/config/db", () => ({
  prisma: {
    invoice: { findFirst: jest.fn(), updateMany: jest.fn() },
    branch: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
  basePrisma: {
    arcaSetting: { findUnique: jest.fn() },
    $executeRaw: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

const mockedPrisma = prisma as unknown as {
  invoice: { findFirst: jest.Mock; updateMany: jest.Mock };
  branch: { findFirst: jest.Mock };
  $transaction: jest.Mock;
};
const mockedBase = basePrisma as unknown as {
  arcaSetting: { findUnique: jest.Mock };
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
};

// ArcaAuthContext de la org (mismo shape que el que resuelve el controller).
const CTX: ArcaAuthContext = {
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 2,
  environment: "HOMOLOGACION",
  certPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.crt",
  keyPath: "/var/www/pullstok/certs/org-1/wswfev1-HOMOLOGACION.key",
};

const SETTING = {
  id: "s1",
  organizationId: "org-1",
  cuitEmisor: "30709706701",
  puntoVenta: 2,
  environment: "HOMOLOGACION",
  certPath: CTX.certPath,
  keyPath: CTX.keyPath,
  enabled: true,
};

// Invoice ISSUED interno (FAC-XXXX, sin CAE) — punto de entrada válido.
const makeIssuedInvoice = (overrides: any = {}) => ({
  id: "inv-1",
  organizationId: "org-1",
  customerId: null,
  number: "FAC-0001",
  status: "ISSUED",
  cae: null,
  caeVencimiento: null,
  cbteNro: null,
  puntoVenta: null,
  tipoComprobante: null,
  docTipoReceptor: null,
  docNroReceptor: null,
  condicionIvaReceptorId: null,
  arcaErrorCode: null,
  arcaErrorMessage: null,
  arcaAttempts: 0,
  items: [
    {
      id: "i1",
      description: "Servicio",
      quantity: 1,
      unitPrice: 100,
      taxRate: 21,
      lineTotal: 100,
    },
  ],
  ...overrides,
});

const makePendingInvoice = (overrides: any = {}) =>
  makeIssuedInvoice({
    status: "PENDING_CAE",
    cbteNro: 13,
    puntoVenta: 2,
    tipoComprobante: "6",
    docTipoReceptor: 99,
    docNroReceptor: "0",
    condicionIvaReceptorId: 5,
    arcaAttempts: 1,
    ...overrides,
  });

describe("fiscalInvoiceService.emitirFiscalmente", () => {
  let mock: ArcaClientMock;
  // currentInvoice: estado mutable que refleja lo que devolvería la DB tras
  // cada updateMany (así el findFirst final del service devuelve el ISSUED).
  let currentInvoice: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mock = createArcaClientMock();
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    // Default: sin sucursal ni casa central con PV → resolvePuntoVenta cae al
    // PV global de la org (ctx.puntoVenta = 2). Los tests de resolvePuntoVenta
    // lo sobreescriben con mockImplementation por where.
    mockedPrisma.branch.findFirst.mockResolvedValue(null);

    // updateMany MERGEA su data sobre el estado actual (devuelve la DB mutada).
    mockedPrisma.invoice.updateMany.mockImplementation(({ data }: any) => {
      const merged = { ...data };
      // arcaAttempts llega como { increment: n } → aplica el delta.
      if (data.arcaAttempts && typeof data.arcaAttempts === "object") {
        merged.arcaAttempts =
          (currentInvoice.arcaAttempts ?? 0) + data.arcaAttempts.increment;
      }
      currentInvoice = { ...currentInvoice, ...merged };
      return { count: 1 };
    });
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );

    // $transaction ejecuta el callback con un tx espejo de prisma.invoice.
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (tx: any) => any) =>
        fn({
          invoice: {
            updateMany: mockedPrisma.invoice.updateMany,
          },
        }),
    );
    mockedBase.$executeRaw.mockResolvedValue(0); // la fila YA existe por defecto
    let nextCounter = 12; // mock ARCA arranca en 12 (bootstrap)
    mockedBase.$queryRaw.mockImplementation(async () => {
      nextCounter += 1;
      return [{ lastReserved: nextCounter }];
    });
  });

  const setInvoice = (inv: any) => {
    currentInvoice = inv;
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );
  };

  it("reserva el correlativo ANTES del SOAP y deja PENDING_CAE (spec 4.1)", async () => {
    setInvoice(makeIssuedInvoice());
    // Fuerza un fallo de red en requestCAE para poder asertar el orden.
    mock.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_NETWORK_ERROR,
      "ECONNRESET",
      502,
    );

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toThrow("ECONNRESET");

    // fix-correlativo-race: el correlativo sale del contador atómico
    // ($queryRaw → 13), NO de getLastInvoiceNumber (ya no es la fuente para
    // emisiones donde la fila del contador existe).
    expect(mock.calls.getLastInvoiceNumber).toBe(0);
    expect(mockedPrisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_CAE",
          cbteNro: 13, // contador atómico (12 + 1)
          tipoComprobante: "6",
          docTipoReceptor: 99,
          docNroReceptor: "0",
          condicionIvaReceptorId: 5,
        }),
      }),
    );
    expect(mock.lastCaeRequest?.cbteNro).toBe(13);
  });

  it("fallo de red conserva PENDING_CAE con arcaError y arcaAttempts+1 (spec 4.4.2)", async () => {
    setInvoice(makePendingInvoice());
    mock.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_NETWORK_ERROR,
      "socket hang up",
      502,
    );

    await expect(
      reintentarFiscalmente("inv-1", mock, CTX),
    ).rejects.toThrow("socket hang up");

    // El error se persiste en una tx corta: PENDING_CAE + código + incremento.
    expect(mockedPrisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING_CAE",
          arcaErrorCode: "ARCA_NETWORK_ERROR",
          arcaErrorMessage: "socket hang up",
          arcaAttempts: { increment: 1 },
        }),
      }),
    );
    // El estado final en DB: PENDING_CAE con arcaAttempts incrementado a 2.
    expect(currentInvoice.status).toBe("PENDING_CAE");
    expect(currentInvoice.arcaAttempts).toBe(2);
    expect(currentInvoice.cae).toBeNull();
    // NUNCA ISSUED sin CAE: status nunca se setea a ISSUED en el fallo.
    const call = mockedPrisma.invoice.updateMany.mock.calls.find((c: any) =>
      c[0]?.data?.status === "ISSUED");
    expect(call).toBeUndefined();
  });

  it("éxito → ISSUED con CAE, limpia arcaError y guarda número fiscal (spec 4.4.3)", async () => {
    setInvoice(makeIssuedInvoice());

    const invoice = (await emitirFiscalmente("inv-1", mock, CTX))!;

    expect(invoice.status).toBe("ISSUED");
    expect(invoice.cae).toBe("72431470192419");
    expect(invoice.puntoVenta).toBe(2);
    expect(invoice.cbteNro).toBe(13);
    expect(invoice.tipoComprobante).toBe("6");
    // El request CAE llevó los montos en centavos: neto 100.00 → 10000, IVA 21.00 → 2100.
    expect(mock.lastCaeRequest?.importeNeto).toBe(10000);
    expect(mock.lastCaeRequest?.importeIva).toBe(2100);
    expect(mock.lastCaeRequest?.importeTotal).toBe(12100);
    // updateMany final = ISSUED + CAE + limpieza de error.
    const issuedCall = mockedPrisma.invoice.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.status === "ISSUED",
    );
    expect(issuedCall).toBeDefined();
    expect(issuedCall[0].data).toMatchObject({
      cae: "72431470192419",
      arcaErrorCode: null,
      arcaErrorMessage: null,
    });
  });

  it("reintento REUTILIZA el mismo correlativo reservado (spec 4.4.2/2.2)", async () => {
    // Invoice ya PENDING_CAE con cbteNro=13 reservado.
    setInvoice(makePendingInvoice());

    const invoice = (await reintentarFiscalmente("inv-1", mock, CTX))!;

    expect(invoice.status).toBe("ISSUED");
    expect(invoice.cbteNro).toBe(13);
    // No se volvió a llamar a getLastInvoiceNumber (correlativo ya reservado).
    expect(mock.calls.getLastInvoiceNumber).toBe(0);
    expect(mock.lastCaeRequest?.cbteNro).toBe(13);
  });

  it("CAE vencido bloquea la emisión con CAE_VENCIDO (spec 4.4.4)", async () => {
    const past = new Date(Date.now() - 2 * 86400000);
    setInvoice(makeIssuedInvoice({ cae: "123", caeVencimiento: past }));

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.CAE_VENCIDO });

    expect(mock.calls.requestCAE).toBe(0);
  });

  it("sin ArcaSetting → ARCA_NOT_CONFIGURED (400)", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(null);

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.ARCA_NOT_CONFIGURED });

    expect(mockedPrisma.invoice.findFirst).not.toHaveBeenCalled();
  });

  it("obs 10048 → ARCA_MONTOS_DESCUADRADOS (spec 2.2)", async () => {
    setInvoice(makeIssuedInvoice());
    mock.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_MONTOS_DESCUADRADOS,
      "Obs: 10048",
      400,
    );

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.ARCA_MONTOS_DESCUADRADOS });
    // Queda PENDING_CAE, nunca ISSUED.
    expect(mock.calls.requestCAE).toBe(1);
    const issued = mockedPrisma.invoice.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.status === "ISSUED",
    );
    expect(issued).toBeUndefined();
  });

  it("Factura A con CUIT válido del cliente (spec 6.1 / 5.4)", async () => {
    setInvoice(
      makeIssuedInvoice({
        customerId: "cust-1",
        // customer.taxId se resuelve en el service antes de derivar.
        customer: { id: "cust-1", taxId: "30-70970670-1" },
      }),
    );

    const invoice = (await emitirFiscalmente("inv-1", mock, CTX))!;

    expect(invoice.tipoComprobante).toBe("1"); // Factura A
    expect(invoice.docTipoReceptor).toBe(80);
    expect(invoice.docNroReceptor).toBe("30709706701");
    expect(invoice.condicionIvaReceptorId).toBe(1);
    expect(mock.lastCaeRequest?.docTipoReceptor).toBe(80);
  });

  it("CUIT inválido del cliente → CUIT_INVALIDO sin avanzar (spec 5.4)", async () => {
    setInvoice(
      makeIssuedInvoice({
        customerId: "cust-1",
        customer: { id: "cust-1", taxId: "30-70970670-2" }, // DV incorrecto
      }),
    );

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.CUIT_INVALIDO });

    // No reservó correlativo ni llamó al SOAP.
    expect(mock.calls.getLastInvoiceNumber).toBe(0);
    expect(mockedPrisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it("invoice en PENDING_CAE para emitir → sugiere retry (409)", async () => {
    setInvoice(makePendingInvoice());

    await expect(
      emitirFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.INVALID_INVOICE_STATE });

    expect(mock.calls.requestCAE).toBe(0);
  });

  it("ya autorizado + consultar devuelve CAE → ISSUED con CAE (design D5 paso 6)", async () => {
    setInvoice(makePendingInvoice());
    mock.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED,
      "El comprobante ya fue autorizado",
      409,
    );

    const invoice = (await reintentarFiscalmente("inv-1", mock, CTX))!;

    // Recuperó el CAE vía FECompConsultar con el correlativo reservado.
    expect(mock.calls.consultarComprobante).toBe(1);
    expect(mock.lastConsultado).toMatchObject({
      puntoVenta: 2,
      tipoCbte: 6,
      cbteNro: 13,
    });
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.cae).toBe("72431470192419");
    // Se adoptó el CAE y se limpió el error.
    const issuedCall = mockedPrisma.invoice.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.status === "ISSUED",
    );
    expect(issuedCall).toBeDefined();
    expect(issuedCall[0].data).toMatchObject({
      cae: "72431470192419",
      arcaErrorCode: null,
      arcaErrorMessage: null,
    });
    // No se incrementó arcaAttempts (se resolvió, no se quedó en PENDING_CAE).
    expect(currentInvoice.status).toBe("ISSUED");
  });

  it("ya autorizado + consultar sin CAE → PENDING_CAE con error (design D5 paso 6)", async () => {
    setInvoice(makePendingInvoice());
    mock.failNextRequestCAE = new ArcaError(
      ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED,
      "Ya autorizado pero sin CAE recuperable",
      409,
    );
    // La consulta no encuentra CAE (se sobreescribe el método real del mock,
    // pero se mantiene el contador de calls para el assert).
    mock.consultarComprobante = async () => {
      mock.calls.consultarComprobante++;
      return null;
    };

    await expect(
      reintentarFiscalmente("inv-1", mock, CTX),
    ).rejects.toMatchObject({ code: ARCA_ERROR_CODES.ARCA_ALREADY_AUTHORIZED });

    expect(mock.calls.consultarComprobante).toBe(1);
    // Queda PENDING_CAE con el error persistido, NUNCA ISSUED.
    expect(currentInvoice.status).toBe("PENDING_CAE");
    expect(currentInvoice.cae).toBeNull();
    expect(currentInvoice.arcaErrorCode).toBe("ARCA_ALREADY_AUTHORIZED");
    expect(currentInvoice.arcaAttempts).toBe(2); // 1 inicial + 1 incremento
    const issued = mockedPrisma.invoice.updateMany.mock.calls.find(
      (c: any) => c[0]?.data?.status === "ISSUED",
    );
    expect(issued).toBeUndefined();
  });
});

describe("fiscalInvoiceService.resolvePuntoVenta (sdd/sucursales-pv-facturacion R2/R5/R6/R8/R10)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.branch.findFirst.mockResolvedValue(null);
  });

  const setBranch = (rows: {
    branch?: any;
    hq?: any;
  }) => {
    mockedPrisma.branch.findFirst.mockImplementation(({ where }: any) => {
      if (where?.isHeadquarters === true) {
        return Promise.resolve(rows.hq ?? null);
      }
      if (where?.id) {
        return Promise.resolve(rows.branch ?? null);
      }
      return Promise.resolve(null);
    });
  };

  it("snapshot congelado (invoice.puntoVenta) gana y NO re-resuelve (R5/R6)", async () => {
    // La sucursal tiene PV=5 pero el snapshot dice 7 → gana el snapshot y ni
    // siquiera se consulta la sucursal.
    setBranch({ branch: { id: "b-1", puntoVenta: 5 } });

    const pv = await resolvePuntoVenta(
      { branchId: "b-1", puntoVenta: 7 },
      2,
    );

    expect(pv).toBe(7);
    expect(mockedPrisma.branch.findFirst).not.toHaveBeenCalled();
  });

  it("R2-E1: PV de la sucursal resuelve cuando no hay snapshot", async () => {
    setBranch({ branch: { id: "b-1", puntoVenta: 5 } });

    const pv = await resolvePuntoVenta(
      { branchId: "b-1", puntoVenta: null },
      2,
    );

    expect(pv).toBe(5);
    // Se consulta la sucursal (scoped a la org), no la casa central.
    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({
      where: { id: "b-1" },
    });
  });

  it("R2-E2: sin PV de sucursal → cae a la casa central (isHeadquarters)", async () => {
    setBranch({
      branch: { id: "b-1", puntoVenta: null },
      hq: { id: "b-hq", isHeadquarters: true, puntoVenta: 3 },
    });

    const pv = await resolvePuntoVenta(
      { branchId: "b-1", puntoVenta: null },
      2,
    );

    expect(pv).toBe(3);
    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({
      where: { isHeadquarters: true },
    });
  });

  it("R2-E3: sin casa central → PV global de ArcaSetting (orgDefaultPv)", async () => {
    setBranch({ branch: { id: "b-1", puntoVenta: null } });

    const pv = await resolvePuntoVenta(
      { branchId: "b-1", puntoVenta: null },
      2,
    );

    expect(pv).toBe(2);
  });

  it("R8: factura legacy sin branchId → resuelve desde la casa central/ PV org", async () => {
    setBranch({ hq: { id: "b-hq", isHeadquarters: true, puntoVenta: 3 } });

    const pv = await resolvePuntoVenta(
      { branchId: null, puntoVenta: null },
      2,
    );

    expect(pv).toBe(3);
    // Solo busca la casa central (no intenta resolver un branch inexistente).
    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledTimes(1);
    expect(mockedPrisma.branch.findFirst).toHaveBeenCalledWith({
      where: { isHeadquarters: true },
    });
  });
});

describe("fiscalInvoiceService.emitirCore + PV resuelto (sdd/sucursales-pv-facturacion R2/R5/R6)", () => {
  let mock: ArcaClientMock;
  let currentInvoice: any;

  const setBranchPv = (pv: number | null) => {
    mockedPrisma.branch.findFirst.mockImplementation(({ where }: any) => {
      if (where?.isHeadquarters === true) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ id: "b-1", puntoVenta: pv });
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mock = createArcaClientMock();
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    mockedPrisma.branch.findFirst.mockResolvedValue(null);

    mockedPrisma.invoice.updateMany.mockImplementation(({ data }: any) => {
      const merged = { ...data };
      if (data.arcaAttempts && typeof data.arcaAttempts === "object") {
        merged.arcaAttempts =
          (currentInvoice.arcaAttempts ?? 0) + data.arcaAttempts.increment;
      }
      currentInvoice = { ...currentInvoice, ...merged };
      return { count: 1 };
    });
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (tx: any) => any) => fn({ invoice: { updateMany: mockedPrisma.invoice.updateMany } }),
    );
    mockedBase.$executeRaw.mockResolvedValue(0); // la fila YA existe por defecto
    let nextCounter = 12; // mock ARCA arranca en 12 (bootstrap)
    mockedBase.$queryRaw.mockImplementation(async () => {
      nextCounter += 1;
      return [{ lastReserved: nextCounter }];
    });
  });

  const setInvoice = (inv: any) => {
    currentInvoice = inv;
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );
  };

  it("emite con el PV de la sucursal en TODA la cadena (sequence, snapshot, CAE)", async () => {
    setBranchPv(5);
    setInvoice(
      makeIssuedInvoice({
        branchId: "b-1",
        // customer con CUIT válido → Factura B (DocTipo 99 / 0) para fijar tipoCbte=6.
        customer: { id: "cust-1", taxId: undefined },
      }),
    );

    const invoice = (await emitirFiscalmente("inv-1", mock, CTX))!;

    // fix-correlativo-race: la fila del contador ya existe ($executeRaw=0) →
    // NO se llama a getLastInvoiceNumber (ya no es la fuente del correlativo).
    expect(mock.calls.getLastInvoiceNumber).toBe(0);
    // El snapshot se persiste: updateMany escribe puntoVenta = 5.
    expect(mockedPrisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ puntoVenta: 5 }),
      }),
    );
    // El contador atómico usó el PV de la sucursal (pv=5, tipoCbte=6) y devolvió 13.
    expect(mockedBase.$queryRaw).toHaveBeenCalled();
    // El request CAE llevó el PV de la sucursal.
    expect(mock.lastCaeRequest?.puntoVenta).toBe(5);
    // El estado final quedó con el snapshot.
    expect(currentInvoice.puntoVenta).toBe(5);
  });

  it("reintento usa el snapshot (invoice.puntoVenta) y NO re-resuelve aunque la sucursal cambie", async () => {
    // La sucursal ahora tiene PV=9, pero la invoice ya tiene snapshot PV=5.
    setBranchPv(9);
    setInvoice(
      makePendingInvoice({
        branchId: "b-1",
        puntoVenta: 5, // snapshot persistido en el primer issue
        customer: { id: "cust-1", taxId: undefined },
      }),
    );

    const getLastSpy = jest.spyOn(mock, "getLastInvoiceNumber");
    const invoice = (await reintentarFiscalmente("inv-1", mock, CTX))!;

    // No re-resuelve: el branch (PV=9) NO se consulta, gana el snapshot (5).
    expect(mockedPrisma.branch.findFirst).not.toHaveBeenCalled();
    // Correlativo reutilizado (no se llama getLastInvoiceNumber).
    expect(getLastSpy).not.toHaveBeenCalled();
    expect(mock.lastCaeRequest?.puntoVenta).toBe(5);
    expect(currentInvoice.puntoVenta).toBe(5);
  });
});

describe("fiscalInvoiceService.reservarCorrelativo (fix-correlativo-race)", () => {
  let mock: ArcaClientMock;
  let currentInvoice: any;

  const setInvoice = (inv: any) => {
    currentInvoice = inv;
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mock = createArcaClientMock();
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    mockedPrisma.branch.findFirst.mockResolvedValue(null);
    mockedPrisma.invoice.updateMany.mockImplementation(({ data }: any) => {
      currentInvoice = { ...currentInvoice, ...data };
      return { count: 1 };
    });
    mockedPrisma.invoice.findFirst.mockImplementation(() =>
      Promise.resolve(currentInvoice),
    );
    mockedPrisma.$transaction.mockImplementation(
      async (fn: (tx: any) => any) => fn({ invoice: { updateMany: mockedPrisma.invoice.updateMany } }),
    );
  });

  it("atomicidad: dos emisiones concurrentes obtienen correlativos DISTINTOS", async () => {
    // Simula la DB: el $queryRaw (UPDATE...RETURNING) entrega valores secuenciales
    // únicos (13, 14) aunque las llamadas sean concurrentes.
    const emitted: number[] = [];
    mockedBase.$executeRaw.mockResolvedValue(0); // la fila ya existe → sin bootstrap
    mockedBase.$queryRaw.mockImplementation(async () => {
      const n = emitted.length === 0 ? 13 : 14;
      emitted.push(n);
      return [{ lastReserved: n }];
    });

    setInvoice(makeIssuedInvoice());
    await emitirFiscalmente("inv-1", mock, CTX);

    setInvoice(makeIssuedInvoice());
    await emitirFiscalmente("inv-2", mock, CTX);

    // Dos números distintos → nunca dos facturas con el mismo cbteNro.
    const cbteNros = emitted;
    expect(cbteNros[0]).not.toBe(cbteNros[1]);
    expect(cbteNros).toEqual([13, 14]);
  });

  it("bootstrap: la primera emisión (fila nueva) inicializa el contador desde getLastInvoiceNumber", async () => {
    // $executeRaw devuelve 1 → la fila se CREÓ ahora → bootstrap desde ARCA.
    mockedBase.$executeRaw.mockResolvedValue(1);
    mockedBase.$queryRaw.mockResolvedValue([{ lastReserved: 13 }]);
    const getLastSpy = jest.spyOn(mock, "getLastInvoiceNumber");

    setInvoice(makeIssuedInvoice());
    await emitirFiscalmente("inv-1", mock, CTX);

    // GetLastInvoiceNumber se llamó para inicializar el contador (lastNumber 12).
    expect(getLastSpy).toHaveBeenCalled();
    // El correlativo emitido es 13 (contador inicializado 12 + 1).
    expect(mock.lastCaeRequest?.cbteNro).toBe(13);
  });

  it("sin bootstrap cuando la fila ya existe: NO llama a getLastInvoiceNumber", async () => {
    mockedBase.$executeRaw.mockResolvedValue(0); // fila existente
    mockedBase.$queryRaw.mockResolvedValue([{ lastReserved: 13 }]);
    const getLastSpy = jest.spyOn(mock, "getLastInvoiceNumber");

    setInvoice(makeIssuedInvoice());
    await emitirFiscalmente("inv-1", mock, CTX);

    expect(getLastSpy).not.toHaveBeenCalled();
    expect(mock.lastCaeRequest?.cbteNro).toBe(13);
  });
});
