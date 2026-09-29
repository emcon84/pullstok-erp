const ESC = 0x1b;
const GS = 0x1d;

/** Small ASCII test ticket: init, a few lines, feed, partial cut. */
export function buildTestTicket(): Uint8Array {
  const text = (s: string) => Buffer.from(s + '\n', 'latin1');
  return Buffer.concat([
    Buffer.from([ESC, 0x40]), // ESC @ initialize
    Buffer.from([ESC, 0x61, 0x01]), // center
    Buffer.from([ESC, 0x45, 0x01]), // bold on
    text('PULLSTOK'),
    Buffer.from([ESC, 0x45, 0x00]), // bold off
    text('Impresion de prueba'),
    text('--------------------------------'),
    text('Si ves este ticket, el agente'),
    text('de impresion funciona bien.'),
    Buffer.from([ESC, 0x64, 0x04]), // feed 4 lines
    Buffer.from([GS, 0x56, 0x01]), // partial cut
  ]);
}
