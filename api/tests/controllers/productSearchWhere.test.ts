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

  it('"razas pequeñas" → AND con un OR final que contiene "sm"', () => {
    const where = buildProductSearchWhere('razas pequeñas');
    const last = where.AND[where.AND.length - 1];
    expect(last.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'sm', mode: 'insensitive' } },
          ]),
        }),
      ]),
    );
  });

  it('"royal canin adulto razas peq" → AND de 4 elementos con OR de "sm"', () => {
    const where = buildProductSearchWhere('royal canin adulto razas peq');
    expect(where.AND).toHaveLength(4);
    expect(where.AND[0].OR[0]).toEqual({ name: { contains: 'royal', mode: 'insensitive' } });
    expect(where.AND[1].OR[0]).toEqual({ name: { contains: 'canin', mode: 'insensitive' } });
    expect(where.AND[2].OR[0]).toEqual({ name: { contains: 'adulto', mode: 'insensitive' } });
    const breedOr = where.AND[3].OR;
    expect(breedOr).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'sm', mode: 'insensitive' } },
          ]),
        }),
      ]),
    );
  });

  it('"razas medianas o grandes" → OR final contiene "lg" y "m&g"', () => {
    const where = buildProductSearchWhere('razas medianas o grandes');
    const last = where.AND[where.AND.length - 1];
    const names = last.OR.flatMap((o: { OR: { name?: { contains: string } }[] }) =>
      o.OR.map((x) => x.name?.contains).filter(Boolean),
    );
    expect(names).toContain('lg');
    expect(names).toContain('m&g');
  });

  it('regresión: "cat chow" devuelve el where original de 2 elementos', () => {
    const where = buildProductSearchWhere('cat chow');
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0].OR[0]).toEqual({ name: { contains: 'cat', mode: 'insensitive' } });
    expect(where.AND[1].OR[0]).toEqual({ name: { contains: 'chow', mode: 'insensitive' } });
  });
});
