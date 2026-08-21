<#
.SYNOPSIS
    Runs coupon discovery using a JSON config file.
#>

param(
    [string]$ConfigPath = "config.json"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "OK" { "Green" }
        default { "Cyan" }
    }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

function Check-Node {
    try {
        $ver = node --version
        $major = [int]($ver -replace '^v(\d+).*','$1')
        if ($major -lt 20) {
            Write-Log "Node.js $ver found - need v20 or higher" -Level "ERROR"
            return $false
        }
        Write-Log "Node.js $ver OK" -Level "OK"
        return $true
    } catch {
        Write-Log "Node.js not found in PATH" -Level "ERROR"
        return $false
    }
}

function Ensure-ChromeRunning {
    param([int]$Port = 9223)
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "Chrome CDP already running on port $Port" -Level "OK"
            return $true
        }
    } catch { }
    Write-Log "Chrome CDP not detected on port $Port. Starting Chrome..." -Level "WARN"
    $scriptPath = Join-Path (Split-Path $PSScriptRoot -Parent) "scripts\start-chrome.ps1"
    if (-not (Test-Path $scriptPath)) {
        Write-Log "start-chrome.ps1 not found at $scriptPath" -Level "ERROR"
        return $false
    }
    & $scriptPath
    return $LASTEXITCODE -eq 0
}

# ─── Load config ─────────────────────────────────────────────────────────
$configPath = Resolve-Path $ConfigPath -ErrorAction SilentlyContinue
if (-not $configPath) {
    Write-Log "Config file not found: $ConfigPath" -Level "ERROR"
    Write-Log "Copy config.template.json to config.json and edit it." -Level "WARN"
    exit 1
}

Write-Log "Loading config: $configPath"
try {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} catch {
    Write-Log "Invalid JSON in config: $($_.Exception.Message)" -Level "ERROR"
    exit 1
}

# Validate required fields
$required = @("brand", "domain")
foreach ($field in $required) {
    if (-not $config.$field) {
        Write-Log "Missing required field: $field" -Level "ERROR"
        exit 1
    }
}

# ─── Check Node.js ───────────────────────────────────────────────────────
if (-not (Check-Node)) { exit 1 }

# ─── Build args from config ──────────────────────────────────────────────
$args = @(
    "src/discover.js",
    "--brand=$($config.brand)",
    "--domain=$($config.domain)"
)

# Optional fields with defaults
$regions = if ($config.regions) { $config.regions -join ',' } else { "us" }
$args += "--regions=$regions"

$args += "--pages=$(if ($config.pages) { $config.pages } else { 2 })"
$args += "--limit=$(if ($config.limit) { $config.limit } else { 15 })"
$args += "--delay=$(if ($config.delay) { $config.delay } else { 4000 })"
$engines = if ($config.engines) { $config.engines -join ',' } else { "google" }
$args += "--engines=$engines"
$args += "--captcha-timeout=$(if ($config.captchaTimeoutMs) { $config.captchaTimeoutMs } else { 300000 })"
$cdpVal = if ($config.cdp) { $config.cdp } else { 'http://127.0.0.1:9223' }
$args += "--cdp=$cdpVal"
$outDirVal = if ($config.outDir) { $config.outDir } else { 'output' }
$args += "--out=$outDirVal"

if ($config.keyword) { $args += "--keyword=$($config.keyword)" }
if ($config.exclude) { $args += "--exclude=$($config.exclude -join ',')" }
if ($config.htmlFirst) { $args += "--html-first" }
if ($config.noAi) { $args += "--no-ai" }
if ($config.includeOther) { $args += "--include-other" }
if ($config.includeUnrelated) { $args += "--include-unrelated" }
if ($config.revealCap) { $args += "--reveal-cap=$($config.revealCap)" }

Write-Host "`n" + ("=" * 60)
Write-Host "Command to run:" -ForegroundColor Cyan
Write-Host "node $($args -join ' ')"
Write-Host "=" * 60

# ─── Ensure Chrome ──────────────────────────────────────────────────────
$cdp = if ($config.cdp) { $config.cdp } else { 'http://127.0.0.1:9223' }
$port = 9223
if ($cdp -match ':(\d+)$') { $port = [int]$matches[1] }
if (-not (Ensure-ChromeRunning -Port $port)) {
    Write-Log "Chrome startup failed." -Level "ERROR"
    exit 1
}

# ─── Run discovery ──────────────────────────────────────────────────────
Write-Log "Starting coupon discovery..." -Level "OK"
Write-Host ""

try {
    node $args
    $exitCode = $LASTEXITCODE
} catch {
    Write-Log "Failed to start node: $($_.Exception.Message)" -Level "ERROR"
    exit 1
}

# ─── Post-run ───────────────────────────────────────────────────────────
if ($exitCode -eq 0) {
    Write-Log "Discovery completed successfully!" -Level "OK"
    $slug = ($config.brand -replace '[^a-z0-9]+','_').ToLower().Trim('_')
    $outPath = Join-Path (Get-Location) (if ($config.outDir) { $config.outDir } else { 'output' }) "${slug}_coupons.csv"
    if (Test-Path $outPath) {
        Write-Log "Output: $outPath"
    }
} else {
    Write-Log "Discovery exited with code $exitCode" -Level "ERROR"
}

exit $exitCode