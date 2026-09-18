import { Response } from "express";
import { basePrisma } from "../../src/config/db";
import { AuthedRequest } from "../../src/middlewares/authMiddleware";
import * as certEncryption from "../../src/utils/certEncryption";
import * as certParsing from "../../src/utils/certParsing";
import * as wsaaClient from "../../src/integrations/arca/wsaaClient";
import { ArcaError, ARCA_ERROR_CODES } from "../../src/integrations/arca/types";

// ArcaCertificate: mismo patrón anti-fuga que ArcaSetting (ver
// arcaSettingsController.test.ts) — NUNCA en TENANT_MODELS, siempre
// basePrisma + requireOrganizationId(), clave compuesta (org, environment).
jest.mock("../../src/config/db", () => ({
  basePrisma: {
    arcaCertificate: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    arcaSetting: { findUnique: jest.fn() },
  },
}));

jest.mock("../../src/config/tenantContext", () => ({
  requireOrganizationId: jest.fn().mockReturnValue("org-1"),
}));

jest.mock("../../src/utils/certEncryption");
jest.mock("../../src/utils/certParsing");
jest.mock("../../src/integrations/arca/wsaaClient", () => ({
  authenticateWsaa: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const arcaCertificatesController = require("../../src/controllers/arcaCertificatesController");
const {
  uploadArcaCertificate,
  getArcaCertificates,
  verifyArcaService,
  clearVerifyServiceCooldown,
} = arcaCertificatesController;

const mockedBase = basePrisma as unknown as {
  arcaCertificate: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  arcaSetting: { findUnique: jest.Mock };
};

const mockedEncrypt = certEncryption.encryptPrivateKeyPem as jest.Mock;
const mockedParse = certParsing.parseCertificatePem as jest.Mock;
const mockedMatches = certParsing.privateKeyMatchesCertificate as jest.Mock;
const mockedAuth = wsaaClient.authenticateWsaa as jest.Mock;

const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const CERT_PEM = "-----BEGIN CERTIFICATE-----\nMII...\n-----END CERTIFICATE-----\n";
const KEY_PEM = "-----BEGIN PRIVATE KEY-----\nMII...\n-----END PRIVATE KEY-----\n";

const buildUploadReq = (overrides: Partial<AuthedRequest> = {}) =>
  ({
    params: { environment: "HOMOLOGACION" },
    files: {
      cert: [{ buffer: Buffer.from(CERT_PEM, "utf8") }],
      key: [{ buffer: Buffer.from(KEY_PEM, "utf8") }],
    },
    user: { id: "user-1", role: "ADMIN", organizationId: "org-1" },
    ...overrides,
  }) as unknown as AuthedRequest;

const PARSED_METADATA = {
  subjectCn: "pullstok-test",
  subjectCuit: "30709706701",
  issuer: "CN=pullstok-test",
  validFrom: new Date("2026-01-01T00:00:00Z"),
  validTo: new Date("2027-01-01T00:00:00Z"),
  isExpired: false,
};

const ENCRYPTED_PAYLOAD = {
  ciphertext: Buffer.from("ciphertext"),
  iv: Buffer.from("iv"),
  authTag: Buffer.from("authtag"),
};

describe("arcaCertificatesController.uploadArcaCertificate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedParse.mockReturnValue(PARSED_METADATA);
    mockedMatches.mockReturnValue(true);
    mockedEncrypt.mockReturnValue(ENCRYPTED_PAYLOAD);
  });

  it("ambiente inválido en el param → 400, no toca la DB", async () => {
    const res = mockResponse();
    await uploadArcaCertificate(
      buildUploadReq({ params: { environment: "STAGING" } } as any),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedBase.arcaCertificate.upsert).not.toHaveBeenCalled();
  });

  it("falta el archivo cert o key → 400", async () => {
    const res = mockResponse();
    await uploadArcaCertificate(
      buildUploadReq({ files: { cert: [{ buffer: Buffer.from(CERT_PEM) }] } } as any),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedBase.arcaCertificate.upsert).not.toHaveBeenCalled();
  });

  it("archivo no es UTF-8 válido → 400, no llama a parseCertificatePem", async () => {
    const res = mockResponse();
    const binary = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]); // JPEG header
    await uploadArcaCertificate(
      buildUploadReq({
        files: {
          cert: [{ buffer: binary }],
          key: [{ buffer: Buffer.from(KEY_PEM, "utf8") }],
        },
      } as any),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockedParse).not.toHaveBeenCalled();
    expect(mockedBase.arcaCertificate.upsert).not.toHaveBeenCalled();
  });

  it("parseCertificatePem rechaza el cert → 400 con el mensaje del parser, nada se guarda", async () => {
    mockedParse.mockImplementation(() => {
      throw new Error("El archivo no es un certificado PEM válido");
    });
    const res = mockResponse();

    await uploadArcaCertificate(buildUploadReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("PEM válido") }),
    );
    expect(mockedBase.arcaCertificate.upsert).not.toHaveBeenCalled();
  });

  it("la clave no corresponde al certificado → 400, NO guarda nada", async () => {
    mockedMatches.mockReturnValue(false);
    const res = mockResponse();

    await uploadArcaCertificate(buildUploadReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "La clave privada no corresponde al certificado",
    });
    expect(mockedEncrypt).not.toHaveBeenCalled();
    expect(mockedBase.arcaCertificate.upsert).not.toHaveBeenCalled();
  });

  it("par válido → cifra la key, upsert por (org, environment) y responde SOLO metadata (nunca cert/key crudos)", async () => {
    mockedBase.arcaCertificate.upsert.mockResolvedValue({
      environment: "HOMOLOGACION",
      ...PARSED_METADATA,
      uploadedAt: new Date("2026-09-18T12:00:00Z"),
      uploadedByUserId: "user-1",
    });
    const res = mockResponse();

    await uploadArcaCertificate(buildUploadReq(), res);

    expect(mockedEncrypt).toHaveBeenCalledWith(KEY_PEM);
    expect(mockedBase.arcaCertificate.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_environment: {
            organizationId: "org-1",
            environment: "HOMOLOGACION",
          },
        },
        create: expect.objectContaining({
          organizationId: "org-1",
          environment: "HOMOLOGACION",
          certPem: CERT_PEM,
          keyCiphertext: ENCRYPTED_PAYLOAD.ciphertext,
          keyIv: ENCRYPTED_PAYLOAD.iv,
          keyAuthTag: ENCRYPTED_PAYLOAD.authTag,
          uploadedByUserId: "user-1",
        }),
        update: expect.objectContaining({
          certPem: CERT_PEM,
          uploadedByUserId: "user-1",
        }),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty("certPem");
    expect(payload).not.toHaveProperty("keyCiphertext");
    expect(payload).not.toHaveProperty("keyPem");
    expect(payload.subjectCn).toBe("pullstok-test");
    expect(payload.subjectCuit).toBe("30709706701");
  });
});

describe("arcaCertificatesController.getArcaCertificates", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sin certificados cargados → { HOMOLOGACION: null, PRODUCCION: null }", async () => {
    mockedBase.arcaCertificate.findMany.mockResolvedValue([]);
    const res = mockResponse();

    await getArcaCertificates({} as AuthedRequest, res);

    expect(res.json).toHaveBeenCalledWith({ HOMOLOGACION: null, PRODUCCION: null });
  });

  it("devuelve metadata por ambiente, nunca certPem/key", async () => {
    mockedBase.arcaCertificate.findMany.mockResolvedValue([
      {
        environment: "HOMOLOGACION",
        ...PARSED_METADATA,
        uploadedAt: new Date("2026-09-18T12:00:00Z"),
        uploadedByUserId: "user-1",
      },
    ]);
    const res = mockResponse();

    await getArcaCertificates({} as AuthedRequest, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.PRODUCCION).toBeNull();
    expect(payload.HOMOLOGACION.subjectCuit).toBe("30709706701");
    expect(payload.HOMOLOGACION).not.toHaveProperty("certPem");
  });
});

describe("arcaCertificatesController.verifyArcaService", () => {
  const SETTING = {
    organizationId: "org-1",
    cuitEmisor: "30709706701",
    puntoVenta: 1,
    environment: "HOMOLOGACION",
    certPath: "/legacy/cert",
    keyPath: "/legacy/key",
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clearVerifyServiceCooldown();
    mockedBase.arcaSetting.findUnique.mockResolvedValue(SETTING);
    mockedBase.arcaCertificate.findUnique.mockResolvedValue({ id: "cert-1" });
  });

  const buildReq = (service: "wsfe" | "ws_sr_padron_a4" = "wsfe") =>
    ({ body: { service } }) as unknown as AuthedRequest;

  it("WSAA habilita el servicio → status habilitado", async () => {
    mockedAuth.mockResolvedValue({ token: "t", sign: "s", cuit: "c" });
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe("habilitado");
    expect(payload.checkedAt).toEqual(expect.any(String));
  });

  it("fault de AFIP 'persona no habilitada' → status no_habilitado, sin filtrar el fault crudo", async () => {
    mockedAuth.mockRejectedValue(
      new ArcaError(
        ARCA_ERROR_CODES.ARCA_AUTH_ERROR,
        "Error WSAA: WSAA fault ns1.coe.alreadyAuthenticated: persona no habilitada para operar el servicio",
        502,
      ),
    );
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe("no_habilitado");
    expect(payload.message).not.toContain("coe.alreadyAuthenticated");
  });

  it("fault real de AFIP 'La persona no se encuentra habilitada...' (Engram #329) → status no_habilitado", async () => {
    mockedAuth.mockRejectedValue(
      new ArcaError(
        ARCA_ERROR_CODES.ARCA_AUTH_ERROR,
        "Error WSAA: WSAA fault ns1.coe.notAuthorized: La persona no se encuentra habilitada para operar el servicio",
        502,
      ),
    );
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe("no_habilitado");
    expect(payload.message).not.toContain("coe.notAuthorized");
  });

  it("error de transporte/parseo → status error, sin filtrar detalles crudos", async () => {
    mockedAuth.mockRejectedValue(
      new ArcaError(ARCA_ERROR_CODES.ARCA_AUTH_ERROR, "Error WSAA: timeout ECONNRESET", 502),
    );
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.status).toBe("error");
    expect(payload.message).not.toContain("ECONNRESET");
  });

  it("sin ArcaSetting completo → status error, NO llama a WSAA ni consume cooldown", async () => {
    mockedBase.arcaSetting.findUnique.mockResolvedValue(null);
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    expect(mockedAuth).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].status).toBe("error");
  });

  it("sin certificado cargado para el ambiente activo → status error, NO llama a WSAA", async () => {
    mockedBase.arcaCertificate.findUnique.mockResolvedValue(null);
    const res = mockResponse();

    await verifyArcaService(buildReq(), res);

    expect(mockedAuth).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].status).toBe("error");
  });

  it("rate limit: segundo intento dentro de los 5 minutos → 429, no llama a WSAA de nuevo", async () => {
    mockedAuth.mockResolvedValue({ token: "t", sign: "s", cuit: "c" });
    const res1 = mockResponse();
    await verifyArcaService(buildReq(), res1);
    expect(mockedAuth).toHaveBeenCalledTimes(1);

    const res2 = mockResponse();
    await verifyArcaService(buildReq(), res2);

    expect(mockedAuth).toHaveBeenCalledTimes(1);
    expect(res2.status).toHaveBeenCalledWith(429);
    const payload = res2.json.mock.calls[0][0];
    expect(payload.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("el rate limit es por (org, service): otro service no está bloqueado", async () => {
    mockedAuth.mockResolvedValue({ token: "t", sign: "s", cuit: "c" });
    await verifyArcaService(buildReq("wsfe"), mockResponse());
    expect(mockedAuth).toHaveBeenCalledTimes(1);

    const res = mockResponse();
    await verifyArcaService(buildReq("ws_sr_padron_a4"), res);

    expect(mockedAuth).toHaveBeenCalledTimes(2);
    expect(res.status).not.toHaveBeenCalledWith(429);
  });
});
