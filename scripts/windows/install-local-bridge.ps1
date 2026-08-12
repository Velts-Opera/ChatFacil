. (Join-Path $PSScriptRoot "common.ps1")

Write-ChatFacilTitle "Instalar ChatFacil local sem mensalidade"

function Install-WithWinget {
  param(
    [Parameter(Mandatory = $true)][string]$PackageId,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $winget = Get-Command "winget.exe" -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "$Name nao esta instalado e o winget nao foi encontrado. Instale pela Microsoft Store e tente novamente."
  }

  Write-Host "Instalando $Name..." -ForegroundColor Yellow
  & $winget.Source install --id $PackageId --exact --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { throw "A instalacao de $Name falhou." }
}

if (-not (Get-NodeExecutable)) {
  Install-WithWinget -PackageId "OpenJS.NodeJS.LTS" -Name "Node.js LTS"
}
if (-not (Get-TailscaleExecutable)) {
  Install-WithWinget -PackageId "Tailscale.Tailscale" -Name "Tailscale"
}

$npm = Get-NpmExecutable
if (-not $npm) { throw "npm nao foi encontrado depois da instalacao do Node.js. Feche esta janela e execute o instalador novamente." }

$root = Get-ChatFacilRoot
$serverDir = Join-Path $root "server"
Write-Host "Instalando componentes do servidor..." -ForegroundColor Yellow

# O Baileys referencia uma dependencia publica do GitHub por um endereco SSH.
# Esta configuracao vale apenas durante o npm ci e evita exigir chave SSH do usuario.
$previousGitConfigCount = $env:GIT_CONFIG_COUNT
$previousGitConfigKey = $env:GIT_CONFIG_KEY_0
$previousGitConfigValue = $env:GIT_CONFIG_VALUE_0
$env:GIT_CONFIG_COUNT = "1"
$env:GIT_CONFIG_KEY_0 = "url.https://github.com/.insteadOf"
$env:GIT_CONFIG_VALUE_0 = "ssh://git@github.com/"
try {
  & $npm ci --prefix $serverDir
} finally {
  $env:GIT_CONFIG_COUNT = $previousGitConfigCount
  $env:GIT_CONFIG_KEY_0 = $previousGitConfigKey
  $env:GIT_CONFIG_VALUE_0 = $previousGitConfigValue
}
if ($LASTEXITCODE -ne 0) { throw "Falha ao instalar os componentes do servidor." }

$environmentFile = Join-Path $serverDir ".env"
$needsConfiguration = $false
try {
  Assert-ConfiguredEnvironment -EnvironmentFile $environmentFile
} catch {
  $needsConfiguration = $true
}
if ($needsConfiguration) {
  & (Join-Path $PSScriptRoot "configure-local-bridge.ps1")
}

$tailscale = Get-TailscaleExecutable
if (-not $tailscale) { throw "Tailscale nao foi encontrado depois da instalacao. Reinicie o Windows e execute este instalador novamente." }

Write-Host "Conectando o Tailscale. Entre com Google, Microsoft ou GitHub na janela que abrir." -ForegroundColor Yellow
& $tailscale up
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel conectar o Tailscale." }

& (Join-Path $PSScriptRoot "start-local-bridge.ps1")
& (Join-Path $PSScriptRoot "enable-autostart.ps1")

Write-Host ""
Write-Host "Instalacao concluida sem cadastrar cartao." -ForegroundColor Green
