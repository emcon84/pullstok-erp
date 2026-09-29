import { describe, expect, it } from 'vitest';
import { buildPowerShellInvocation } from '../src/spooler';

describe('buildPowerShellInvocation', () => {
  const evil = `X"; Remove-Item C:\ -Recurse; "`;

  it('never interpolates the printer name or file path into the script text', () => {
    const inv = buildPowerShellInvocation(evil, 'C:\tmp\evil `$(calc).bin');
    const scriptDecoded = Buffer.from(inv.encodedScript, 'base64').toString('utf16le');
    expect(scriptDecoded).not.toContain('Remove-Item');
    expect(scriptDecoded).not.toContain('calc');
    expect(inv.args.join(' ')).not.toContain('Remove-Item');
    expect(inv.env.PULLSTOK_PRINTER).toBe(evil);
    expect(inv.env.PULLSTOK_FILE).toBe('C:\tmp\evil `$(calc).bin');
  });

  it('runs powershell hidden, non interactive and uses winspool RAW', () => {
    const inv = buildPowerShellInvocation('OCOM', 'C:\t.bin');
    expect(inv.command).toBe('powershell.exe');
    expect(inv.args).toEqual(
      expect.arrayContaining(['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']),
    );
    const script = Buffer.from(inv.encodedScript, 'base64').toString('utf16le');
    for (const fn of ['OpenPrinter', 'StartDocPrinter', 'StartPagePrinter', 'WritePrinter', 'EndPagePrinter', 'EndDocPrinter', 'ClosePrinter']) {
      expect(script).toContain(fn);
    }
    expect(script).toContain('winspool.drv');
    expect(script).toContain('RAW');
    expect(script).toContain('$env:PULLSTOK_PRINTER');
  });

  it('is the same script regardless of input (static)', () => {
    expect(buildPowerShellInvocation('A', 'a').encodedScript).toBe(buildPowerShellInvocation('B', 'b').encodedScript);
  });
});
