. (Join-Path $PSScriptRoot "common.ps1")

Write-ChatFacilTitle "Ativar inicio automatico"

$root = Get-ChatFacilRoot
$startScript = Join-Path $root "scripts\windows\start-local-bridge.ps1"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "ChatFacil Local.cmd"
$command = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -Quiet`r`n"

[IO.File]::WriteAllText($startupFile, $command, [Text.Encoding]::ASCII)

Write-Host "Pronto. O ChatFacil iniciara automaticamente quando voce entrar no Windows." -ForegroundColor Green
Write-Host "Atalho criado em: $startupFile"
