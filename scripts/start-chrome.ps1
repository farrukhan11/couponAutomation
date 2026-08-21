<#
.SYNOPSIS
    Start Chrome with remote debugging enabled for coupon automation.

.DESCRIPTION
    Launches Chrome with --remote-debugging-port=9223 and a dedicated profile.
    Waits until the CDP endpoint responds (max 15s). Skips if Chrome already running on port 9223.

.PARAMETER ProfileDir
    Chrome user data directory. Default: C:\coupon-agent\chrome-profile-4

.PARAMETER Port
    Remote debugging port. Default: 9223

.PARAMETER ChromePath
    Path to chrome.exe. Default: C:\Program Files\Google\Chrome\Application\chrome.exe

.EXAMPLE
    .\scripts\start-chrome.ps1

.EXAMPLE
    .\scripts\start-chrome.ps1 -ProfileDir "C:\my-chrome-profile" -Port 9224
#>

param(
    [string]$ProfileDir = "C:\coupon-agent\chrome-profile-4",
    [int]$Port = 9223,
    [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
)

$ErrorActionPreference = "Stop"

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

Write-Log "Checking Chrome CDP on port $Port..."

# Check if already running
try {
    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Log "Chrome already running with CDP on port $Port" -Level "OK"
        exit 0
    }
} catch {
    # Not running, continue
}

# Ensure profile directory exists
if (-not (Test-Path $ProfileDir)) {
    New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    Write-Log "Created profile directory: $ProfileDir"
}

# Verify Chrome exists
if (-not (Test-Path $ChromePath)) {
    Write-Log "Chrome not found at: $ChromePath" -Level "ERROR"
    Write-Log "Please install Chrome or update -ChromePath parameter" -Level "ERROR"
    exit 1
}

$args = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--no-default-browser-check",
    "--disable-gpu",
    "about:blank"
)

Write-Log "Starting Chrome with remote debugging on port $Port..."
Write-Log "Profile: $ProfileDir"

try {
    $proc = Start-Process -FilePath $ChromePath -ArgumentList $args -PassThru -WindowStyle Normal
} catch {
    Write-Log "Failed to start Chrome: $($_.Exception.Message)" -Level "ERROR"
    exit 1
}

# Wait for CDP to become ready (max 15s)
$deadline = (Get-Date).AddSeconds(15)
Write-Log "Waiting for CDP endpoint..."
while ((Get-Date) -lt $deadline) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            Write-Log "Chrome CDP ready on port $Port" -Level "OK"
            exit 0
        }
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

Write-Log "Timeout waiting for Chrome CDP (15s)" -Level "WARN"
Write-Log "Chrome process may still be starting. Check manually: http://127.0.0.1:$Port/json/version" -Level "WARN"
exit 1