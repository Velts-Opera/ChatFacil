param()

$ErrorActionPreference = 'Stop'

$ExpectedOrgId = 'team_iCr30NKpFZBaOWxynzDsuZie'
$ExpectedProjectId = 'prj_2bxeLmViz7MPHOA5hTuRe6lJZ1tL'
$ExpectedProjectName = 'veltsapp'

function Get-YamlScalar([string]$Line) {
    $parts = $Line.Split(':', 2)
    if ($parts.Count -ne 2) { return '' }
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        if ($value.Length -ge 2) { $value = $value.Substring(1, $value.Length - 2) }
    }
    return $value
}

function Read-LiveKitProjectConfig([string]$Path) {
    if (-not (Test-Path $Path)) {
        throw "LiveKit CLI config not found at [$Path]."
    }

    $lines = @(Get-Content -LiteralPath $Path)
    $defaultProject = ''
    foreach ($line in $lines) {
        if ($line -match '^default_project\s*:') {
            $defaultProject = Get-YamlScalar $line
            break
        }
    }

    if (-not $defaultProject) {
        throw 'LiveKit CLI default_project is missing.'
    }
    if ($defaultProject -ne $ExpectedProjectName) {
        throw "LiveKit CLI default project is [$defaultProject], expected [$ExpectedProjectName]."
    }

    $projectStart = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match ('^\s{2}' + [regex]::Escape($defaultProject) + '\s*:\s*$')) {
            $projectStart = $i
            break
        }
    }
    if ($projectStart -lt 0) {
        throw "Project [$defaultProject] was not found in LiveKit CLI config."
    }

    $url = ''
    $apiKey = ''
    $apiSecret = ''
    for ($i = $projectStart + 1; $i -lt $lines.Count; $i++) {
        $line = [string]$lines[$i]
        if ($line -match '^\s{0,2}\S' -and $line -notmatch '^\s{4}') { break }
        if ($line -match '^\s{4}url\s*:') { $url = Get-YamlScalar $line; continue }
        if ($line -match '^\s{4}api_key\s*:') { $apiKey = Get-YamlScalar $line; continue }
        if ($line -match '^\s{4}api_secret\s*:') { $apiSecret = Get-YamlScalar $line; continue }
    }

    if ($url -notmatch '^wss://') { throw 'LiveKit URL is missing or invalid.' }
    if (-not $apiKey) { throw 'LiveKit API key is missing.' }
    if (-not $apiSecret) { throw 'LiveKit API secret is missing.' }

    return @{
        Url = $url
        ApiKey = $apiKey
        ApiSecret = $apiSecret
    }
}

function Invoke-Vercel {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [bool]$AllowFailure = $false
    )

    & $script:VercelCommand @Arguments
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFailure) {
        throw "Vercel CLI exited with code $code."
    }
    return $code
}

function Add-VercelEnvFromValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [bool]$Sensitive = $false
    )

    $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ("chatfacil-stella-" + [guid]::NewGuid().ToString('N') + '.txt')
    try {
        [System.IO.File]::WriteAllText($tempPath, $Value, (New-Object System.Text.UTF8Encoding($false)))

        [void](Invoke-Vercel -Arguments @('env', 'rm', $Name, 'production', '--yes') -AllowFailure $true)

        $vercelPath = (Get-Command $script:VercelCommand -ErrorAction Stop).Source
        $sensitiveArg = if ($Sensitive) { ' --sensitive' } else { '' }
        $commandLine = '"' + $vercelPath + '" env add ' + $Name + ' production' + $sensitiveArg + ' < "' + $tempPath + '"'
        $process = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/d', '/s', '/c', $commandLine) -Wait -PassThru -NoNewWindow
        if ($process.ExitCode -ne 0) {
            throw "Failed to configure Vercel environment variable [$Name]."
        }
    }
    finally {
        Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
    }
}

foreach ($command in @('git', 'vercel')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command [$command] was not found."
    }
}
$script:VercelCommand = 'vercel'

$repoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
if (-not $repoRoot) { throw 'Run this script inside the ChatFacil repository.' }
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
if ($branch -ne 'main') { throw "Publication must run from [main], current branch is [$branch]." }
if (git status --porcelain) { throw 'Working tree must be clean before production publication.' }

git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'git fetch origin main failed.' }
$head = (git rev-parse HEAD).Trim()
$originMain = (git rev-parse origin/main).Trim()
if ($head -ne $originMain) { throw 'Local main must exactly match origin/main before publication.' }

$liveKitConfigPath = Join-Path $env:USERPROFILE '.livekit\cli-config.yaml'
$liveKit = Read-LiveKitProjectConfig $liveKitConfigPath

$env:VERCEL_ORG_ID = $ExpectedOrgId
$env:VERCEL_PROJECT_ID = $ExpectedProjectId

Write-Host 'Configuring Stella server-only LiveKit variables in Vercel production...'
Add-VercelEnvFromValue -Name 'LIVEKIT_URL' -Value $liveKit.Url -Sensitive $false
Add-VercelEnvFromValue -Name 'LIVEKIT_API_KEY' -Value $liveKit.ApiKey -Sensitive $true
Add-VercelEnvFromValue -Name 'LIVEKIT_API_SECRET' -Value $liveKit.ApiSecret -Sensitive $true

Write-Host 'Environment variables configured without printing credential values.'
Write-Host 'Deploying ChatFacil main to Vercel production...'
[void](Invoke-Vercel -Arguments @('deploy', '--prod', '--non-interactive'))
Write-Host 'Stella production publication command completed.'
