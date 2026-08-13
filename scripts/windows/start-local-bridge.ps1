param([switch]$Quiet)

. (Join-Path $PSScriptRoot "common.ps1")

if (-not $Quiet) { Write-ChatFacilTitle "Iniciar ChatFacil local" }

$root = Get-ChatFacilRoot
$serverDir = Join-Path $root "server"
$environmentFile = Join-Path $serverDir ".env"
$runtimeDir = Join-Path $serverDir ".runtime"
$pidFile = Join-Path $runtimeDir "bridge.pid"
$stdoutLog = Join-Path $runtimeDir "bridge.log"
$stderrLog = Join-Path $runtimeDir "bridge-error.log"

Assert-ConfiguredEnvironment -EnvironmentFile $environmentFile

$node = Get-NodeExecutable
if (-not $node) { throw "Node.js nao encontrado. Execute INSTALAR_CHATFACIL_LOCAL.cmd." }

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null

$isRunning = $false
if (Test-Path $pidFile) {
  $savedPid = [int](Get-Content $pidFile -Raw)
  $isRunning = $null -ne (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)
}

if (-not $isRunning) {
  $process = Start-Process -FilePath $node `
    -ArgumentList "whatsapp-bridge.js" `
    -WorkingDirectory $serverDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -PassThru
  [IO.File]::WriteAllText($pidFile, [string]$process.Id)
}

$healthy = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  try {
    $response = Invoke-RestMethod "http://127.0.0.1:3001/health" -TimeoutSec 2
    if ($response.ok) { $healthy = $true; break }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $healthy) {
  Write-Host "O servidor nao iniciou. Ultimas mensagens:" -ForegroundColor Red
  if (Test-Path $stderrLog) { Get-Content $stderrLog -Tail 30 }
  throw "Falha ao iniciar o servidor local."
}

$publicUrl = "https://api.veltsapp.com"
[IO.File]::WriteAllText((Join-Path $runtimeDir "public-url.txt"), $publicUrl)

Write-Host "ChatFacil local esta funcionando." -ForegroundColor Green
Write-Host ""
Write-Host "ENDERECO PUBLICO DO CLOUDFLARE:" -ForegroundColor Yellow
Write-Host $publicUrl -ForegroundColor Cyan
Write-Host ""
Write-Host "Teste publico: $publicUrl/health"

if (-not $Quiet) {
  Write-Host ""
  Write-Host "Logs: server\.runtime\bridge.log"
}
