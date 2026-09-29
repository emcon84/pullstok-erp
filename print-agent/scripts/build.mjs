// Build pipeline: esbuild (single CJS) -> Node SEA blob -> PullstokPrintAgent.exe -> installer.
// Requires Node >= 20 on Windows. Output goes to print-agent/dist (git-ignored).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const exePath = join(dist, 'PullstokPrintAgent.exe');
const skipInstaller = process.argv.includes('--no-installer');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// 1. Bundle to a single CommonJS file (SEA requires a single script).
await build({
  entryPoints: [join(root, 'src/main.ts')],
  outfile: join(dist, 'agent.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  minify: true,
  define: { 'process.env.PULLSTOK_PRINT_VERSION': JSON.stringify(pkg.version) },
});
console.log('bundle: dist/agent.cjs');

// 2. Node SEA: blob from the bundle, injected into a copy of node.exe.
writeFileSync(
  join(dist, 'sea-config.json'),
  JSON.stringify({ main: 'agent.cjs', output: 'sea-prep.blob', disableExperimentalSEAWarning: true }),
);
execFileSync(process.execPath, ['--experimental-sea-config', 'sea-config.json'], { cwd: dist, stdio: 'inherit' });
copyFileSync(process.execPath, exePath);

const postject = join(root, 'node_modules', 'postject', 'dist', 'cli.js');
execFileSync(
  process.execPath,
  [
    postject,
    exePath,
    'NODE_SEA_BLOB',
    join(dist, 'sea-prep.blob'),
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ],
  { stdio: 'inherit' },
);

// 3. Mark the executable as a GUI-subsystem app so autostart never shows a console window.
let buf = readFileSync(exePath);
const peOffset = buf.readUInt32LE(0x3c);
if (buf.toString('latin1', peOffset, peOffset + 4) !== 'PE\0\0') throw new Error('Not a PE file');
const optHeader = peOffset + 4 + 20;
if (buf.readUInt16LE(optHeader) !== 0x20b) throw new Error('Expected a PE32+ (64-bit) executable');
buf.writeUInt16LE(2, optHeader + 68); // Subsystem = IMAGE_SUBSYSTEM_WINDOWS_GUI

// Injecting the blob invalidates Node's original Authenticode signature; strip it so the exe is
// simply unsigned (instead of "signed with a corrupted signature").
const secDir = optHeader + 112 + 4 * 8; // data directory #4 = certificate table (file offset, size)
const certOffset = buf.readUInt32LE(secDir);
const certSize = buf.readUInt32LE(secDir + 4);
if (certOffset > 0 && certOffset + certSize === buf.length) buf = buf.subarray(0, certOffset);
buf.writeUInt32LE(0, secDir);
buf.writeUInt32LE(0, secDir + 4);
writeFileSync(exePath, buf);
console.log(`exe: dist/PullstokPrintAgent.exe (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

// 4. Installer (IExpress ships with Windows; Inno Setup is used instead if `iscc` is on PATH).
if (!skipInstaller) {
  const { buildInstaller } = await import('./installer.mjs');
  buildInstaller({ root, dist, version: pkg.version });
}
if (!existsSync(join(dist, 'PullstokPrintAgent.exe'))) throw new Error('build failed');
