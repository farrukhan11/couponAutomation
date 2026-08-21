<#
.SYNOPSIS
    Interactive runner for coupon discovery — prompts for brand details and runs the pipeline.
#>

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "WARN" { "Yellow" }
        "ERROR" { "Red" }
        "OK" { "Green" }
        "INPUT" { "Magenta" }
        default { "Cyan" }
    }
    Write-Host "[$ts] [$Level] $Message" -ForegroundColor $color
}

function Read-Input {
    param(
        [Parameter(Mandatory=$true)][string]$Prompt,
        [string]$Default = "",
        [bool]$Required = $true,
        [scriptblock]$Validator = $null
    )
    while ($true) {
        $suffix = if ($Default) { " [$Default]" } else { "" }
        Write-Host "`n${Prompt}${suffix}: " -NoNewline -ForegroundColor "Magenta"
        $input = Read-Host
        if (-not $input -and $Default) { $input = $Default }
        if ($Required -and (-not $input)) {
            Write-Log "This field is required." -Level "WARN"
            continue
        }
        if ($Validator -and -not (& $Validator $input)) {
            Write-Log "Invalid input, please try again." -Level "WARN"
            continue
        }
        return $input
    }
}

function Confirm-Choice {
    param(
        [Parameter(Mandatory=$true)][string]$Prompt,
        [bool]$Default = $true
    )
    $suffix = if ($Default) { " [Y/n]" } else { " [y/N]" }
    Write-Host "`n${Prompt}${suffix}: " -NoNewline -ForegroundColor "Magenta"
    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
    Write-Host ""
    if ($key.Character -eq '') { return $Default }
    return ($key.Character -in @('y','Y'))
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

# ─── Main ────────────────────────────────────────────────────────────────
Write-Host "`n============================================================"
Write-Host "     Coupon Discovery - Interactive Runner"
Write-Host "============================================================`n"

if (-not (Check-Node)) { exit 1 }

# ─── Collect inputs ─────────────────────────────────────────────────────
$brand = Read-Input -Prompt "Brand name (e.g., Sleep and Beyond)" -Default "" -Required $true
$domain = Read-Input -Prompt "Store domain (e.g., sleepandbeyond.com)" -Default "" -Required $true

$regionsInput = Read-Input -Prompt "Regions (comma: us,uk)" -Default "us" -Required $false
$regions = $regionsInput -split ',' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -in @('us','uk') }
if (-not $regions) { $regions = @('us') }

$pages = [int](Read-Input -Prompt "Search pages per keyword" -Default "2" -Required $false -Validator { $_ -match '^\d+$' -and [int]$_ -gt 0 })
$limit = [int](Read-Input -Prompt "Max sites to scrape per region" -Default "15" -Required $false -Validator { $_ -match '^\d+$' -and [int]$_ -gt 0 })
$delay = [int](Read-Input -Prompt "Delay between searches (ms)" -Default "4000" -Required $false -Validator { $_ -match '^\d+$' })

$keyword = Read-Input -Prompt "Search keyword (empty = auto-generate)" -Default "" -Required $false
$exclude = Read-Input -Prompt "Exclude words (comma-separated, e.g. Nikki,Sarah)" -Default "" -Required $false

$htmlFirst = Confirm-Choice -Prompt "Use HTML fast path first (html-first)?" -Default $true
$noAi = Confirm-Choice -Prompt "Disable AI reveal (no-ai)?" -Default $false

$captchaTimeout = [int](Read-Input -Prompt "Captcha manual solve timeout (ms)" -Default "300000" -Required $false -Validator { $_ -match '^\d+$' })
$cdp = Read-Input -Prompt "Chrome CDP endpoint" -Default "http://127.0.0.1:9223" -Required $false
$outDir = Read-Input -Prompt "Output directory" -Default "output" -Required $false
$enginesInput = Read-Input -Prompt "Search engines (comma: google,ddg,bing)" -Default "google" -Required $false
$engines = $enginesInput -split ',' | ForEach-Object { $_.Trim().ToLower() } | Where-Object { $_ -in @('google','ddg','bing') }
if (-not $engines) { $engines = @('google') }

# ─── Build command ──────────────────────────────────────────────────────
$args = @(
    "src/discover.js",
    "--brand=$brand",
    "--domain=$domain",
    "--regions=$($regions -join ',')",
    "--pages=$pages",
    "--limit=$limit",
    "--delay=$delay",
    "--engines=$($engines -join ',')",
    "--captcha-timeout=$captchaTimeout",
    "--cdp=$cdp",
    "--out=$outDir"
)
if ($keyword) { $args += "--keyword=$keyword" }
if ($exclude) { $args += "--exclude=$exclude" }
if ($htmlFirst) { $args += "--html-first" }
if ($noAi) { $args += "--no-ai" }
$args += "--include-other"

Write-Host "`n" + ("=" * 60)
Write-Host "Command to run:" -ForegroundColor Cyan
Write-Host "node $($args -join ' ')"
Write-Host "=" * 60

if (-not (Confirm-Choice -Prompt "Run now?" -Default $true)) {
    Write-Log "Aborted by user." -Level "WARN"
    exit 0
}

# ─── Ensure Chrome ──────────────────────────────────────────────────────
$port = 9223
if ($cdp -match ':(\d+)$') { $port = [int]$matches[1] }
if (-not (Ensure-ChromeRunning -Port $port)) {
    Write-Log "Chrome startup failed. You can start it manually and re-run." -Level "ERROR"
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
    $slug = ($brand -replace '[^a-z0-9]+','_').ToLower().Trim('_')
    $outPath = Join-Path (Get-Location) $outDir "${slug}_coupons.csv"
    if (Test-Path $outPath) {
        if (Confirm-Choice -Prompt "Open output folder?" -Default $true) {
            Start-Process "explorer.exe" (Join-Path (Get-Location) $outDir)
        }
    }
} else {
    Write-Log "Discovery exited with code $exitCode" -Level "ERROR"
}

exit $exitCode