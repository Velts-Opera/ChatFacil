$ErrorActionPreference = "Stop"

function Get-ChatFacilRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-TailscaleExecutable {
  $command = Get-Command "tailscale.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $installed = Join-Path $env:ProgramFiles "Tailscale\tailscale.exe"
  if (Test-Path $installed) { return $installed }

  return $null
}

function Get-NodeExecutable {
  $command = Get-Command "node.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $installed = Join-Path $env:ProgramFiles "nodejs\node.exe"
  if (Test-Path $installed) { return $installed }

  return $null
}

function Get-NpmExecutable {
  $command = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $installed = Join-Path $env:ProgramFiles "nodejs\npm.cmd"
  if (Test-Path $installed) { return $installed }

  return $null
}

function Assert-ConfiguredEnvironment {
  param([Parameter(Mandatory = $true)][string]$EnvironmentFile)

  if (-not (Test-Path $EnvironmentFile)) {
    throw "Configuracao ausente. Execute CONFIGURAR_CHATFACIL_LOCAL.cmd primeiro."
  }

  $contents = Get-Content $EnvironmentFile -Raw
  foreach ($name in @("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ALLOWED_ORIGINS")) {
    if ($contents -notmatch "(?m)^$name=(?!\s*$).+") {
      throw "$name nao foi preenchida. Execute CONFIGURAR_CHATFACIL_LOCAL.cmd novamente."
    }
  }

  if ($contents -match "SEU_PROJETO|INSIRA_A_|SEU_FRONTEND") {
    throw "O arquivo server\.env ainda contem valores de exemplo. Execute CONFIGURAR_CHATFACIL_LOCAL.cmd."
  }
}

function Write-ChatFacilTitle {
  param([string]$Title)
  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Cyan
  Write-Host ""
}
