import CategoryService from '../../src/services/categoryService';
import { prisma } from '../../src/config/db';
import { requireOrganizationId } from '../../src/config/tenantContext';
import { industryCategories } from '../../src/config/industryCategories';

jest.mock('../../src/config/db', () => ({
  prisma: {
    category: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/config/tenantContext', () => ({
  requireOrganizationId: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  category: {
    findFirst: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
  };
};
const mockedRequireOrgId = requireOrganizationId as jest.Mock;

describe('CategoryService', () => {
  const organizationId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedRequireOrgId.mockReturnValue(organizationId);
  });

  describe('bulkCreate', () => {
    it('crea todas las categorías nuevas de la lista', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `cat-${data.name}`, ...data }),
      );

      const result = await CategoryService.bulkCreate(['Tornillos', 'Pinturas']);

      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(2);
      expect(mockedPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Tornillos', organizationId },
      });
      expect(mockedPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Pinturas', organizationId },
      });
      expect(result).toHaveLength(2);
    });

    it('reusa una categoría existente en vez de duplicarla (unicidad por organización)', async () => {
      const existing = { id: 'cat-existing', name: 'Tornillos', organizationId };
      mockedPrisma.category.findFirst.mockResolvedValue(existing);

      const result = await CategoryService.bulkCreate(['Tornillos']);

      expect(mockedPrisma.category.create).not.toHaveBeenCalled();
      expect(result).toEqual([existing]);
    });

    it('deduplica nombres repetidos en el mismo array de entrada antes de tocar la DB', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: `cat-${data.name}`, ...data }),
      );

      const result = await CategoryService.bulkCreate(['Tornillos', 'Tornillos', '  Tornillos  ']);

      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('ignora strings vacíos o solo espacios', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockResolvedValue({ id: 'cat-1', name: 'Real' });

      await CategoryService.bulkCreate(['', '   ', 'Real']);

      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Real', organizationId },
      });
    });
  });

  describe('list', () => {
    it('devuelve las categorías de la organización ordenadas por nombre', async () => {
      const categories = [{ id: '1', name: 'A' }, { id: '2', name: 'B' }];
      mockedPrisma.category.findMany.mockResolvedValue(categories);

      const result = await CategoryService.list();

      expect(mockedPrisma.category.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
      });
      expect(result).toEqual(categories);
    });
  });

  describe('categorías sugeridas por industry (industryCategories.ts)', () => {
    it('FERRETERIA tiene categorías sugeridas no vacías', () => {
      expect(industryCategories.FERRETERIA.length).toBeGreaterThan(0);
    });

    it('KIOSCO tiene categorías sugeridas no vacías', () => {
      expect(industryCategories.KIOSCO.length).toBeGreaterThan(0);
    });

    it('INDUMENTARIA tiene categorías sugeridas no vacías', () => {
      expect(industryCategories.INDUMENTARIA.length).toBeGreaterThan(0);
    });

    it('ALMACEN tiene categorías sugeridas no vacías', () => {
      expect(industryCategories.ALMACEN.length).toBeGreaterThan(0);
    });

    it('OTHER devuelve vacío (el usuario arranca de cero)', () => {
      expect(industryCategories.OTHER).toEqual([]);
    });
  });
});
