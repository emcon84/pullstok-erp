import { describe, expect, it } from 'vitest';
import { buildTestTicket } from '../src/testTicket';

describe('buildTestTicket', () => {
  it('starts with ESC @ and ends with a partial cut (GS V 1)', () => {
    const b = buildTestTicket();
    expect([...b.slice(0, 2)]).toEqual([0x1b, 0x40]);
    expect([...b.slice(-3)]).toEqual([0x1d, 0x56, 0x01]);
  });
  it('contains readable ASCII text', () => {
    expect(Buffer.from(buildTestTicket()).toString('latin1')).toContain('PULLSTOK');
  });
});
