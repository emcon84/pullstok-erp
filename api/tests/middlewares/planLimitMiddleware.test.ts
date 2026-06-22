import { Response } from 'express';
import { checkUserLimit, checkProductLimit } from '../../src/middlewares/planLimitMiddleware';
import { basePrisma, prisma } from '../../src/config/db';
import { requireOrganizationId } from '../../src/config/tenantContext';
import { AuthedRequest } from '../../src/middlewares/authMiddleware';

jest.mock('../../src/config/db', () => ({
  basePrisma: {
    organization: {
      findUniqueOrThrow: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
  },
  prisma: {
    product: {
      count: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/tenantContext', () => ({
  requireOrganizationId: jest.fn(),
}));

const mockedBasePrisma = basePrisma as unknown as {
  organization: { findUniqueOrThrow: jest.Mock };
  user: { count: jest.Mock };
};
const mockedPrisma = prisma as unknown as {
  product: { count: jest.Mock };
};
const mockedRequireOrganizationId = requireOrganizationId as jest.Mock;

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('planLimitMiddleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireOrganizationId.mockReturnValue('org-1');
  });

  describe('checkUserLimit', () => {
    it('llama a next() si la cantidad actual está por debajo del límite del plan', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'BASICO' });
      mockedBasePrisma.user.count.mockResolvedValue(1);
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkUserLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('responde 403 PLAN_LIMIT si la cantidad actual alcanzó el límite del plan (BASICO = 2)', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'BASICO' });
      mockedBasePrisma.user.count.mockResolvedValue(2);
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkUserLimit(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'PLAN_LIMIT',
        resource: 'users',
        limit: 2,
        current: 2,
      });
    });

    it('llama a next() sin contar usuarios si el plan tiene maxUsers null (ilimitado, ej. PREMIUM)', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'PREMIUM' });
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkUserLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockedBasePrisma.user.count).not.toHaveBeenCalled();
    });

    it('responde 400 si no hay organizationId en el tenant context', async () => {
      mockedRequireOrganizationId.mockImplementation(() => {
        throw new Error('No hay contexto de organización (tenant) en este request');
      });
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkUserLimit(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('checkProductLimit', () => {
    it('llama a next() si la cantidad actual está por debajo del límite del plan', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'BASICO' });
      mockedPrisma.product.count.mockResolvedValue(499);
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkProductLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('responde 403 PLAN_LIMIT si la cantidad actual alcanzó el límite del plan (BASICO = 500)', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'BASICO' });
      mockedPrisma.product.count.mockResolvedValue(500);
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkProductLimit(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'PLAN_LIMIT',
        resource: 'products',
        limit: 500,
        current: 500,
      });
    });

    it('llama a next() sin contar productos si el plan tiene maxProducts null (ilimitado, ej. PRO)', async () => {
      mockedBasePrisma.organization.findUniqueOrThrow.mockResolvedValue({ plan: 'PRO' });
      const req = {} as AuthedRequest;
      const res = mockResponse();
      const next = jest.fn();

      await checkProductLimit(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(mockedPrisma.product.count).not.toHaveBeenCalled();
    });
  });
});
