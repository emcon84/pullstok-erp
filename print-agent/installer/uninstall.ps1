# Removes the Pullstok print agent for the current user.
$ErrorActionPreference = 'SilentlyContinue'
$appName = 'PullstokPrint'
$dest = Join-Path $env:LOCALAPPDATA $appName

Get-Process -Name 'PullstokPrintAgent' | Stop-Process -Force
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name $appName
Remove-Item -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appName" -Recurse -Force

# This script lives inside $dest, so delete the folder from a detached process after we exit.
Start-Process -WindowStyle Hidden -FilePath 'cmd.exe' -ArgumentList '/c', ('ping -n 3 127.0.0.1 >nul & rmdir /s /q "' + $dest + '"')
