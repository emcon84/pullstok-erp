// Builds dist/PullstokPrint-Setup.exe with IExpress (bundled with Windows).
// Inno Setup was not installed on the build machine and tooling is never downloaded silently.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function buildInstaller({ root, dist }) {
  const stage = dist;
  for (const f of ['install.ps1', 'install.cmd', 'uninstall.ps1', 'uninstall.cmd']) {
    copyFileSync(join(root, 'installer', f), join(stage, f));
  }
  const target = join(dist, 'PullstokPrint-Setup.exe');
  const files = ['PullstokPrintAgent.exe', 'install.ps1', 'install.cmd', 'uninstall.ps1', 'uninstall.cmd'];
  const sed = [
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '[Options]',
    'PackagePurpose=InstallApp',
    'ShowInstallProgramWindow=0',
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    'InstallPrompt=%InstallPrompt%',
    'DisplayLicense=%DisplayLicense%',
    'FinishMessage=%FinishMessage%',
    'TargetName=%TargetName%',
    'FriendlyName=%FriendlyName%',
    'AppLaunched=%AppLaunched%',
    'PostInstallCmd=%PostInstallCmd%',
    'AdminQuietInstCmd=%AdminQuietInstCmd%',
    'UserQuietInstCmd=%UserQuietInstCmd%',
    'SourceFiles=SourceFiles',
    '[Strings]',
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=Pullstok Print se instalo y ya esta funcionando. Podes cerrar esta ventana.',
    `TargetName=${target}`,
    'FriendlyName=Pullstok Print',
    'AppLaunched=cmd.exe /c .\\install.cmd',
    'PostInstallCmd=<None>',
    'AdminQuietInstCmd=cmd.exe /c .\\install.cmd',
    'UserQuietInstCmd=cmd.exe /c .\\install.cmd',
    ...files.map((f, i) => `FILE${i}="${f}"`),
    '[SourceFiles]',
    'SourceFiles0=' + stage + '\\',
    '[SourceFiles0]',
    ...files.map((_, i) => `%FILE${i}%=`),
  ];
  const sedText = sed.join('\r\n') + '\r\n';
  const sedPath = join(dist, 'PullstokPrint.sed');
  writeFileSync(sedPath, sedText, 'ascii');

  const r = spawnSync('iexpress', ['/N', '/Q', sedPath], { stdio: 'inherit' });
  if (r.status !== 0 && !existsSync(target)) throw new Error(`iexpress failed (exit ${r.status})`);
  // iexpress returns before the file is fully written on some machines; wait for it.
  for (let i = 0; i < 60 && !existsSync(target); i++) execFileSync('ping', ['-n', '2', '127.0.0.1'], { stdio: 'ignore' });
  if (!existsSync(target)) throw new Error('iexpress did not produce PullstokPrint-Setup.exe');
  console.log(`installer: dist/PullstokPrint-Setup.exe (${(statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
}
