import fs from 'fs';
import { Readable } from 'stream';
import { resolveCategoryId, bulkAddProducts } from '../../src/services/productsService';
import { basePrisma } from '../../src/config/db';

jest.mock('../../src/config/db', () => ({
  basePrisma: {
    category: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    product: {
      createMany: jest.fn(),
    },
  },
}));

const mockedPrisma = basePrisma as unknown as {
  category: { findFirst: jest.Mock; create: jest.Mock };
  product: { createMany: jest.Mock };
};

describe('productsService', () => {
  const organizationId = 'org-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCategoryId', () => {
    it('reusa una categoría existente en la organización (no la duplica)', async () => {
      const existing = { id: 'cat-1', name: 'Tornillos', organizationId };
      mockedPrisma.category.findFirst.mockResolvedValue(existing);

      const result = await resolveCategoryId('Tornillos', organizationId);

      expect(mockedPrisma.category.findFirst).toHaveBeenCalledWith({
        where: { organizationId, name: 'Tornillos' },
      });
      expect(mockedPrisma.category.create).not.toHaveBeenCalled();
      expect(result).toBe('cat-1');
    });

    it('crea la categoría si no existe, con el organizationId correcto', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockResolvedValue({
        id: 'cat-new',
        name: 'Pinturas',
        organizationId,
      });

      const result = await resolveCategoryId('Pinturas', organizationId);

      expect(mockedPrisma.category.create).toHaveBeenCalledWith({
        data: { name: 'Pinturas', organizationId },
      });
      expect(result).toBe('cat-new');
    });

    it('devuelve null si el nombre de categoría viene vacío o undefined', async () => {
      expect(await resolveCategoryId('', organizationId)).toBeNull();
      expect(await resolveCategoryId(undefined, organizationId)).toBeNull();
      expect(await resolveCategoryId('   ', organizationId)).toBeNull();
      expect(mockedPrisma.category.findFirst).not.toHaveBeenCalled();
    });

    it('trimea espacios antes de buscar/crear', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockResolvedValue({ id: 'cat-x', name: 'Electricidad' });

      await resolveCategoryId('  Electricidad  ', organizationId);

      expect(mockedPrisma.category.findFirst).toHaveBeenCalledWith({
        where: { organizationId, name: 'Electricidad' },
      });
    });
  });

  describe('bulkAddProducts', () => {
    const filePath = '/tmp/fake-products.csv';
    const csvContent =
      'name,price,description,category,image,quantity\n' +
      'Martillo,1500,Martillo de acero,Herramientas,,10\n' +
      'Pinza,800,Pinza universal,Herramientas,,5\n';

    beforeEach(() => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'createReadStream').mockReturnValue(
        Readable.from([csvContent]) as unknown as fs.ReadStream,
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('lanza error si el archivo no existe', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      await expect(bulkAddProducts(filePath, organizationId)).rejects.toThrow(
        'El archivo no existe en la ruta especificada',
      );
    });

    it('reusa la misma categoría para filas repetidas del mismo CSV (no la duplica)', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create.mockResolvedValueOnce({
        id: 'cat-herramientas',
        name: 'Herramientas',
        organizationId,
      });
      // Tras la primera creación, la segunda fila debe encontrarla (find-or-create
      // secuencial real) — simulamos el efecto recreando el comportamiento del
      // servicio: la segunda llamada a findFirst debería encontrar lo creado.
      mockedPrisma.category.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'cat-herramientas', name: 'Herramientas', organizationId });
      mockedPrisma.product.createMany.mockResolvedValue({ count: 2 });

      await bulkAddProducts(filePath, organizationId);

      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.product.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            name: 'Martillo',
            categoryId: 'cat-herramientas',
            organizationId,
          }),
          expect.objectContaining({
            name: 'Pinza',
            categoryId: 'cat-herramientas',
            organizationId,
          }),
        ],
      });
    });

    it('asigna el organizationId correcto a cada producto creado', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Herramientas',
        organizationId,
      });
      mockedPrisma.product.createMany.mockResolvedValue({ count: 2 });

      await bulkAddProducts(filePath, organizationId);

      const callArg = mockedPrisma.product.createMany.mock.calls[0][0];
      for (const product of callArg.data) {
        expect(product.organizationId).toBe(organizationId);
      }
    });
  });
});
