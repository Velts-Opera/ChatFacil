. (Join-Path $PSScriptRoot "common.ps1")

Write-ChatFacilTitle "Configurar ChatFacil local"

$root = Get-ChatFacilRoot
$serverDir = Join-Path $root "server"
$environmentFile = Join-Path $serverDir ".env"
$dataDir = (Join-Path $serverDir "data\whatsapp-sessions").Replace("\", "/")

Write-Host "Copie os valores da aba Variables do Railway antes de abandonar o projeto." -ForegroundColor Yellow
Write-Host "As chaves ficam somente neste computador e nao serao enviadas ao GitHub."
Write-Host "Pressione Enter para manter um valor que ja esteja configurado."
Write-Host ""

$existing = @{}
if (Test-Path $environmentFile) {
  foreach ($line in Get-Content $environmentFile) {
    if ($line -match '^([^#=]+)=(.*)$') {
      $existing[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
}

function Read-Value {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Label,
    [string]$Default = "",
    [switch]$Optional
  )

  $current = if ($existing.ContainsKey($Name)) { $existing[$Name] } else { $Default }
  $suffix = if ($current) { " [$current]" } else { "" }
  do {
    $value = Read-Host "$Label$suffix"
    if ([string]::IsNullOrWhiteSpace($value)) { $value = $current }
    if ($Optional -or -not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    Write-Host "Este valor e obrigatorio." -ForegroundColor Yellow
  } while ($true)
}

function Read-SecretValue {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Label,
    [switch]$Optional
  )

  $hasCurrent = $existing.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($existing[$Name])
  do {
    $suffix = if ($hasCurrent) { " (Enter mantem a chave atual)" } else { "" }
    $secure = Read-Host "$Label$suffix" -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    if ([string]::IsNullOrWhiteSpace($value) -and $hasCurrent) { return $existing[$Name] }
    if ($Optional -or -not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    Write-Host "Este valor e obrigatorio." -ForegroundColor Yellow
  } while ($true)
}

$supabaseUrl = Read-Value "SUPABASE_URL" "SUPABASE_URL"
$anonKey = Read-SecretValue "SUPABASE_ANON_KEY" "SUPABASE_ANON_KEY"
$serviceKey = Read-SecretValue "SUPABASE_SERVICE_ROLE_KEY" "SUPABASE_SERVICE_ROLE_KEY"
$allowedOrigins = Read-Value "ALLOWED_ORIGINS" "Endereco do painel na Vercel" "https://chatfacil-sigma.vercel.app"

Write-Host ""
Write-Host "A chave de IA e opcional. Sem ela, o WhatsApp conecta e recebe mensagens," -ForegroundColor Yellow
Write-Host "mas encaminha a conversa para atendimento humano em vez de gerar resposta."
$aiProvider = Read-Value "AI_PROVIDER" "Provedor de IA" "alibaba" -Optional
$aiApiKey = Read-SecretValue "AI_API_KEY" "AI_API_KEY (opcional)" -Optional
$aiBaseUrl = Read-Value "AI_BASE_URL" "AI_BASE_URL" "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" -Optional
$aiModel = Read-Value "AI_MODEL" "Modelo de IA" "qwen-plus" -Optional

$values = @(
  "HOST=127.0.0.1"
  "PORT=3001"
  "LOG_LEVEL=info"
  "SUPABASE_URL=$supabaseUrl"
  "SUPABASE_ANON_KEY=$anonKey"
  "SUPABASE_SERVICE_ROLE_KEY=$serviceKey"
  "AI_PROVIDER=$aiProvider"
  "AI_API_KEY=$aiApiKey"
  "AI_BASE_URL=$aiBaseUrl"
  "AI_MODEL=$aiModel"
  "GEMINI_API_KEY="
  "GEMINI_MODEL=gemini-1.5-flash"
  "ALLOWED_ORIGINS=$allowedOrigins"
  "SESSION_DATA_PATH=$dataDir"
)

[IO.File]::WriteAllLines($environmentFile, $values, [Text.UTF8Encoding]::new($false))
Write-Host ""
Write-Host "Configuracao salva em server\.env." -ForegroundColor Green
Write-Host "Nao envie esse arquivo para ninguem: ele contem chaves privadas." -ForegroundColor Yellow
