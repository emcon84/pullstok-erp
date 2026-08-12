import { buildProductSearchWhere } from '../../src/controllers/productController';

describe('buildProductSearchWhere', () => {
  it('palabra suelta → OR entre nombre, código y variante', () => {
    const where = buildProductSearchWhere('Purina');
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ name: { contains: 'Purina', mode: 'insensitive' } });
    expect(where.OR[2]).toEqual({
      variantAssignments: {
        some: {
          option: { value: { contains: 'Purina', mode: 'insensitive' } },
        },
      },
    });
  });

  it('varias palabras sin coma → AND de ORs (comportamiento original)', () => {
    const where = buildProductSearchWhere('cat chow');
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({
      OR: [
        { name: { contains: 'cat', mode: 'insensitive' } },
        { code: { contains: 'cat', mode: 'insensitive' } },
        {
          variantAssignments: {
            some: {
              option: { value: { contains: 'cat', mode: 'insensitive' } },
            },
          },
        },
      ],
    });
  });

  it('coma → OR entre términos (multi-marca)', () => {
    const where = buildProductSearchWhere('Purina, Proplan');
    expect(where.OR).toHaveLength(2);
    // Cada término es un OR propio de nombre/código/variante
    expect(where.OR[0].OR).toHaveLength(3);
    expect(where.OR[0].OR[0]).toEqual({ name: { contains: 'Purina', mode: 'insensitive' } });
    expect(where.OR[1].OR[0]).toEqual({ name: { contains: 'Proplan', mode: 'insensitive' } });
  });

  it('término con espacios dentro de la coma → AND dentro de ese término', () => {
    const where = buildProductSearchWhere('Purina, cat chow');
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].OR).toHaveLength(3);
    expect(where.OR[1].AND).toHaveLength(2);
  });

  it('tolerancia a espacios alrededor de las comas', () => {
    const where = buildProductSearchWhere('Purina,Proplan , Kongo');
    expect(where.OR).toHaveLength(3);
    expect(where.OR[1].OR[0]).toEqual({ name: { contains: 'Proplan', mode: 'insensitive' } });
    expect(where.OR[2].OR[0]).toEqual({ name: { contains: 'Kongo', mode: 'insensitive' } });
  });

  it('comas consecutivas no generan términos vacíos', () => {
    const where = buildProductSearchWhere('Purina,,Proplan');
    expect(where.OR).toHaveLength(2);
  });
});
