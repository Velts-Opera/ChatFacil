. (Join-Path $PSScriptRoot "common.ps1")

Write-ChatFacilTitle "Parar ChatFacil local"

$root = Get-ChatFacilRoot
$runtimeDir = Join-Path $root "server\.runtime"
$pidFile = Join-Path $runtimeDir "bridge.pid"

if (Test-Path $pidFile) {
  $savedPid = [int](Get-Content $pidFile -Raw)
  $process = Get-Process -Id $savedPid -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $savedPid
    Write-Host "Servidor local encerrado."
  }
  Remove-Item $pidFile -Force
}

Write-Host "ChatFacil local esta parado." -ForegroundColor Green
