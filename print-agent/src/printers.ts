import { runPowerShell } from './spooler';

const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Printer | ForEach-Object { $_.Name })
`;

export function parsePrinterList(output: string): string[] {
  const trimmed = output.trim();
  if (!trimmed) return [];
  const parsed: unknown = JSON.parse(trimmed);
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.filter((n): n is string => typeof n === 'string' && n.length > 0);
}

export async function listWindowsPrinters(): Promise<string[]> {
  const encoded = Buffer.from(LIST_SCRIPT, 'utf16le').toString('base64');
  const out = await runPowerShell({
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    env: {},
  });
  return parsePrinterList(out);
}
