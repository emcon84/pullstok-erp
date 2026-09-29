# Per-user install of the Pullstok print agent. No administrator rights required.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$appName = 'PullstokPrint'
$exeName = 'PullstokPrintAgent.exe'
$dest = Join-Path $env:LOCALAPPDATA $appName
$exeDest = Join-Path $dest $exeName
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$logFile = Join-Path $env:TEMP 'PullstokPrint-install.log'

try {
    # Stop a previous version so the executable can be replaced.
    Get-Process -Name 'PullstokPrintAgent' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 800

    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item -Force -Path (Join-Path $src $exeName) -Destination $exeDest
    Copy-Item -Force -Path (Join-Path $src 'uninstall.ps1') -Destination $dest
    Copy-Item -Force -Path (Join-Path $src 'uninstall.cmd') -Destination $dest

    # Autostart at user logon (HKCU, no admin).
    $run = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    Set-ItemProperty -Path $run -Name $appName -Value ('"' + $exeDest + '"')

    # Entry in "Apps & features" (per-user uninstall).
    $unKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appName"
    New-Item -Path $unKey -Force | Out-Null
    Set-ItemProperty -Path $unKey -Name 'DisplayName' -Value 'Pullstok Print (agente de impresion)'
    Set-ItemProperty -Path $unKey -Name 'Publisher' -Value 'Pullstok'
    Set-ItemProperty -Path $unKey -Name 'InstallLocation' -Value $dest
    Set-ItemProperty -Path $unKey -Name 'DisplayIcon' -Value $exeDest
    Set-ItemProperty -Path $unKey -Name 'UninstallString' -Value ('"' + (Join-Path $dest 'uninstall.cmd') + '"')
    Set-ItemProperty -Path $unKey -Name 'NoModify' -Value 1 -Type DWord
    Set-ItemProperty -Path $unKey -Name 'NoRepair' -Value 1 -Type DWord

    # Start right away (hidden: the exe has no console window).
    Start-Process -FilePath $exeDest -WindowStyle Hidden
    'OK ' + (Get-Date -Format o) | Out-File -FilePath $logFile -Encoding utf8
}
catch {
    ('ERROR ' + $_.Exception.Message) | Out-File -FilePath $logFile -Encoding utf8
    exit 1
}
