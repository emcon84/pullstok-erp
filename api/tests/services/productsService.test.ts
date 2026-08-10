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
    categoryVariantDefinition: {
      findMany: jest.fn(),
    },
    product: {
      create: jest.fn(),
      createMany: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    productVariant: {
      createMany: jest.fn(),
    },
    pricingSetting: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    // syncHqStock corre con basePrisma (fuera de ALS) en el import CSV; sin HQ
    // branch el sync no toca nada (early return), así los tests existentes no
    // dependen de filas de stock.
    $transaction: jest.fn((cb: any) =>
      cb({
        branch: { findFirst: jest.fn().mockResolvedValue(null) },
        productStock: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
        product: { updateMany: jest.fn() },
      }),
    ),
  },
}));

const mockedPrisma = basePrisma as unknown as {
  category: { findFirst: jest.Mock; create: jest.Mock };
  categoryVariantDefinition: { findMany: jest.Mock };
  product: { create: jest.Mock; createMany: jest.Mock; updateMany: jest.Mock };
  productVariant: { createMany: jest.Mock };
  $transaction: jest.Mock;
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

    it('resuelve rutas con > (ej: "Perros > Alimento Seco") paso a paso', async () => {
      mockedPrisma.category.findFirst
        .mockResolvedValueOnce({ id: 'perros-id', name: 'Perros', organizationId, parentId: null })
        .mockResolvedValueOnce({ id: 'seco-id', name: 'Alimento Seco (Balanceado)', organizationId, parentId: 'perros-id' });

      const result = await resolveCategoryId('Perros > Alimento Seco (Balanceado)', organizationId);

      expect(result).toBe('seco-id');
      expect(mockedPrisma.category.findFirst).toHaveBeenCalledTimes(2);
      expect(mockedPrisma.category.findFirst).toHaveBeenNthCalledWith(1, {
        where: { organizationId, name: 'Perros', parentId: null },
      });
      expect(mockedPrisma.category.findFirst).toHaveBeenNthCalledWith(2, {
        where: { organizationId, name: 'Alimento Seco (Balanceado)', parentId: 'perros-id' },
      });
    });

    it('crea niveles faltantes en rutas', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue(null);
      mockedPrisma.category.create
        .mockResolvedValueOnce({ id: 'new-perros', name: 'Perros', organizationId, parentId: null })
        .mockResolvedValueOnce({ id: 'new-seco', name: 'Alimento Seco', organizationId, parentId: 'new-perros' });

      const result = await resolveCategoryId('Perros > Alimento Seco', organizationId);

      expect(result).toBe('new-seco');
      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(2);
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
      mockedPrisma.category.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'cat-herramientas', name: 'Herramientas', organizationId });
      mockedPrisma.product.create.mockResolvedValue({ id: 'p-1' });
      mockedPrisma.categoryVariantDefinition.findMany.mockResolvedValue([]);

      const result = await bulkAddProducts(filePath, organizationId);

      expect(mockedPrisma.category.create).toHaveBeenCalledTimes(1);
      expect(mockedPrisma.product.create).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(2);
    });

    it('asigna el organizationId correcto a cada producto creado', async () => {
      mockedPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-1',
        name: 'Herramientas',
        organizationId,
      });
      mockedPrisma.product.create.mockResolvedValue({ id: 'p-1' });
      mockedPrisma.categoryVariantDefinition.findMany.mockResolvedValue([]);

      const result = await bulkAddProducts(filePath, organizationId);

      expect(result.count).toBe(2);
      const calls = mockedPrisma.product.create.mock.calls;
      for (const call of calls) {
        expect(call[0].data.organizationId).toBe(organizationId);
      }
      // Cada fila con quantity dispara syncHqStock (spec D4) — 2 filas = 2 sync.
      expect(mockedPrisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('resuelve columnas de variantes y crea product_variants', async () => {
      const csvWithVariants =
        'name,price,category,Tipo,Medida / N°\n' +
        'Collar Cuero Chico,2500,Collares,Cuero,Chico\n';

      jest.spyOn(fs, 'createReadStream').mockReturnValue(
        Readable.from([csvWithVariants]) as unknown as fs.ReadStream,
      );

      mockedPrisma.category.findFirst.mockResolvedValue({
        id: 'cat-collares', name: 'Collares', organizationId,
      });
      mockedPrisma.categoryVariantDefinition.findMany.mockResolvedValue([
        {
          id: 'def-tipo', categoryId: 'cat-collares', name: 'Tipo',
          options: [
            { id: 'opt-cuero', value: 'Cuero' },
            { id: 'opt-ahorque', value: 'Ahorque' },
          ],
        },
        {
          id: 'def-medida', categoryId: 'cat-collares', name: 'Medida / N°',
          options: [
            { id: 'opt-chico', value: 'Chico' },
            { id: 'opt-grande', value: 'Grande' },
          ],
        },
      ]);
      mockedPrisma.product.create.mockResolvedValue({ id: 'p-collar' });
      mockedPrisma.productVariant.createMany.mockResolvedValue({ count: 2 });

      const result = await bulkAddProducts(filePath, organizationId);

      expect(result.count).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockedPrisma.productVariant.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ productId: 'p-collar', optionId: 'opt-cuero' }),
          expect.objectContaining({ productId: 'p-collar', optionId: 'opt-chico' }),
        ],
      });
    });
  });
});
