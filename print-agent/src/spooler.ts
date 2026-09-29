import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RawSpooler {
  print(printerName: string, bytes: Uint8Array): Promise<void>;
}

/**
 * Static script: the printer name and file path are read from environment
 * variables, so user input is never part of the script text.
 */
const RAW_PRINT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.drv", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

  public static void SendBytes(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed: " + Marshal.GetLastWin32Error());
    try {
      DOCINFO di = new DOCINFO();
      di.pDocName = "Pullstok ticket";
      di.pDataType = "RAW";
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(h)) throw new Exception("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
        int written;
        if (!WritePrinter(h, data, data.Length, out written) || written != data.Length)
          throw new Exception("WritePrinter failed: " + Marshal.GetLastWin32Error());
        EndPagePrinter(h);
      } finally { EndDocPrinter(h); }
    } finally { ClosePrinter(h); }
  }
}
'@
$bytes = [System.IO.File]::ReadAllBytes($env:PULLSTOK_FILE)
[RawPrinterHelper]::SendBytes($env:PULLSTOK_PRINTER, $bytes)
`;

export interface PowerShellInvocation {
  command: string;
  args: string[];
  env: Record<string, string>;
  encodedScript: string;
}

export function buildPowerShellInvocation(printerName: string, filePath: string): PowerShellInvocation {
  const encodedScript = Buffer.from(RAW_PRINT_SCRIPT, 'utf16le').toString('base64');
  return {
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
    env: { PULLSTOK_PRINTER: printerName, PULLSTOK_FILE: filePath },
    encodedScript,
  };
}

export function runPowerShell(inv: { command: string; args: string[]; env: Record<string, string> }): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(inv.command, inv.args, {
      env: { ...process.env, ...inv.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`powershell exited with ${code}: ${err.trim() || out.trim()}`));
    });
  });
}

export function createWindowsSpooler(): RawSpooler {
  return {
    async print(printerName, bytes) {
      const dir = await mkdtemp(join(tmpdir(), 'pullstok-print-'));
      const file = join(dir, 'job.bin');
      try {
        await writeFile(file, bytes);
        await runPowerShell(buildPowerShellInvocation(printerName, file));
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
