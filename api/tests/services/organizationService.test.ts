import OrganizationService from '../../src/services/organizationService';
import { basePrisma } from '../../src/config/db';

jest.mock('../../src/config/db', () => ({
  basePrisma: {
    organization: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

const mockedPrisma = basePrisma as unknown as {
  organization: {
    updateMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('OrganizationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('update', () => {
    it('actualiza los datos del negocio y devuelve la organización actualizada', async () => {
      const organizationId = 'org-1';
      const data = { name: 'Ferretería Don José', address: 'Av. Siempreviva 742' };
      const updatedOrg = { id: organizationId, ...data };

      mockedPrisma.organization.updateMany.mockResolvedValue({ count: 1 });
      mockedPrisma.organization.findFirst.mockResolvedValue(updatedOrg);

      const result = await OrganizationService.update(organizationId, data);

      expect(mockedPrisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: organizationId },
        data,
      });
      expect(mockedPrisma.organization.findFirst).toHaveBeenCalledWith({
        where: { id: organizationId },
      });
      expect(result).toEqual(updatedOrg);
    });

    it('lanza error si la organización no existe (updateMany count 0)', async () => {
      mockedPrisma.organization.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        OrganizationService.update('org-inexistente', { name: 'X' }),
      ).rejects.toThrow('Organización no encontrada');

      expect(mockedPrisma.organization.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('completeOnboarding', () => {
    it('marca onboardingCompletedAt si la org no lo tenía completo', async () => {
      const organizationId = 'org-1';
      const freshOrg = { id: organizationId, onboardingCompletedAt: null };
      const completedOrg = { id: organizationId, onboardingCompletedAt: new Date() };

      mockedPrisma.organization.findFirst
        .mockResolvedValueOnce(freshOrg)
        .mockResolvedValueOnce(completedOrg);
      mockedPrisma.organization.updateMany.mockResolvedValue({ count: 1 });

      const result = await OrganizationService.completeOnboarding(organizationId);

      expect(mockedPrisma.organization.updateMany).toHaveBeenCalledWith({
        where: { id: organizationId },
        data: { onboardingCompletedAt: expect.any(Date) },
      });
      expect(result).toEqual(completedOrg);
    });

    it('es idempotente: si ya estaba completo, no vuelve a actualizar', async () => {
      const organizationId = 'org-1';
      const alreadyCompleted = {
        id: organizationId,
        onboardingCompletedAt: new Date('2026-01-01T00:00:00Z'),
      };

      mockedPrisma.organization.findFirst.mockResolvedValue(alreadyCompleted);

      const result = await OrganizationService.completeOnboarding(organizationId);

      expect(mockedPrisma.organization.updateMany).not.toHaveBeenCalled();
      expect(result).toEqual(alreadyCompleted);
    });

    it('llamarlo dos veces seguidas no rompe ni duplica nada (idempotencia real)', async () => {
      const organizationId = 'org-1';
      let completedAt: Date | null = null;

      mockedPrisma.organization.findFirst.mockImplementation(() =>
        Promise.resolve({ id: organizationId, onboardingCompletedAt: completedAt }),
      );
      mockedPrisma.organization.updateMany.mockImplementation(() => {
        completedAt = new Date();
        return Promise.resolve({ count: 1 });
      });

      const first = await OrganizationService.completeOnboarding(organizationId);
      const second = await OrganizationService.completeOnboarding(organizationId);

      expect(mockedPrisma.organization.updateMany).toHaveBeenCalledTimes(1);
      expect(first?.onboardingCompletedAt).not.toBeNull();
      expect(second?.onboardingCompletedAt).toEqual(first?.onboardingCompletedAt);
    });

    it('lanza error si la organización no existe', async () => {
      mockedPrisma.organization.findFirst.mockResolvedValue(null);

      await expect(
        OrganizationService.completeOnboarding('org-inexistente'),
      ).rejects.toThrow('Organización no encontrada');
    });
  });

  describe('getSuggestedCategories', () => {
    it('devuelve categorías sugeridas para un rubro conocido', () => {
      const result = OrganizationService.getSuggestedCategories('FERRETERIA');
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('devuelve un array vacío para OTHER (sin categorías sugeridas)', () => {
      const result = OrganizationService.getSuggestedCategories('OTHER');
      expect(result).toEqual([]);
    });
  });
});
