param()

$ErrorActionPreference = 'Stop'

$ExpectedOrgId = 'team_iCr30NKpFZBaOWxynzDsuZie'
$ExpectedProjectId = 'prj_2bxeLmViz7MPHOA5hTuRe6lJZ1tL'
$ExpectedLiveKitUrl = 'wss://veltsapp-j8mqf7tp.livekit.cloud'

function Get-DotEnvValues([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw 'LiveKit CLI did not create the expected temporary environment file.'
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = ([string]$line).Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) {
            continue
        }

        $parts = $trimmed.Split('=', 2)
        $name = $parts[0].Trim()
        $value = $parts[1].Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            if ($value.Length -ge 2) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        $values[$name] = $value
    }

    return $values
}

function Export-LiveKitCredentials {
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) ("chatfacil-livekit-" + [guid]::NewGuid().ToString('N'))
    $examplePath = Join-Path $tempDir '.env.example'
    $envPath = Join-Path $tempDir '.env.local'

    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    try {
        $example = "LIVEKIT_URL=`r`nLIVEKIT_API_KEY=`r`nLIVEKIT_API_SECRET=`r`n"
        [System.IO.File]::WriteAllText($examplePath, $example, (New-Object System.Text.UTF8Encoding($false)))

        Push-Location $tempDir
        try {
            # Windows PowerShell converts native stderr output into NativeCommandError when
            # $ErrorActionPreference is Stop. LiveKit emits a non-fatal permissions warning
            # on Windows, so allow native stderr here and trust the process exit code below.
            $previousErrorActionPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                $null = & lk app env -w 2>&1
                $code = $LASTEXITCODE
            }
            finally {
                $ErrorActionPreference = $previousErrorActionPreference
            }
        }
        finally {
            Pop-Location
        }

        if ($code -ne 0) {
            throw "LiveKit CLI failed to export the active project environment (exit code $code)."
        }

        $values = Get-DotEnvValues $envPath
        $url = ([string]$values['LIVEKIT_URL']).Trim().TrimEnd('/')
        $apiKey = ([string]$values['LIVEKIT_API_KEY']).Trim()
        $apiSecret = ([string]$values['LIVEKIT_API_SECRET']).Trim()

        if ($url -ne $ExpectedLiveKitUrl) {
            throw 'The active LiveKit CLI project does not match the Velts-Bad production endpoint.'
        }
        if (-not $apiKey) {
            throw 'LiveKit CLI export did not contain LIVEKIT_API_KEY.'
        }
        if (-not $apiSecret) {
            throw 'LiveKit CLI export did not contain LIVEKIT_API_SECRET.'
        }

        return @{
            Url = $url
            ApiKey = $apiKey
            ApiSecret = $apiSecret
        }
    }
    finally {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
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

foreach ($command in @('git', 'vercel', 'lk')) {
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

$liveKit = Export-LiveKitCredentials

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
