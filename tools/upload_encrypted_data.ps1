param(
    [string]$Repo = "",
    [string]$LocalPath = "",
    [string]$RemotePath = "",
    [string]$ConfigFile = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
. (Join-Path $PSScriptRoot "dashboard_config.ps1")

$configFileSetting = $ConfigFile
if ([string]::IsNullOrWhiteSpace($configFileSetting)) {
    $configFileSetting = [Environment]::GetEnvironmentVariable("TDX_DASHBOARD_CONFIG_FILE", "Process")
}
if ([string]::IsNullOrWhiteSpace($configFileSetting)) {
    $configFileSetting = "dashboard.config.txt"
}
$configPath = Resolve-LocalPath $configFileSetting $projectRoot
$config = Read-DashboardConfig $configPath

$Repo = Get-DashboardSetting $config $Repo "TDX_DASHBOARD_GITHUB_REPO" "GITHUB_REPO" "SII-Yuning-Zhou/tdx-shenxian-dashboard"
$LocalPath = Get-DashboardSetting $config $LocalPath "TDX_DASHBOARD_ENCRYPTED_JSON" "ENCRYPTED_JSON" "public\data\latest.enc.json"
$RemotePath = Get-DashboardSetting $config $RemotePath "TDX_DASHBOARD_REMOTE_PATH" "REMOTE_PATH" "public/data/latest.enc.json"
$LocalPath = Resolve-LocalPath $LocalPath $projectRoot

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "GitHub CLI gh was not found in PATH"
}

if (-not (Test-Path -LiteralPath $LocalPath)) {
    throw "Missing encrypted data file: $LocalPath"
}

$status = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI is not logged in. Run gh auth login first."
}

$escapedRemotePath = [System.Uri]::EscapeDataString($RemotePath).Replace("%2F", "/")
$existingJson = gh api "repos/$Repo/contents/$escapedRemotePath" 2>$null
$existingSha = $null
if ($LASTEXITCODE -eq 0 -and $existingJson) {
    $existingSha = ($existingJson | ConvertFrom-Json).sha
}

$content = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $LocalPath)))
$payload = @{
    message = "Update encrypted signals"
    content = $content
    branch = "main"
}
if ($existingSha) {
    $payload.sha = $existingSha
}

$payload | ConvertTo-Json -Depth 5 | gh api --method PUT "repos/$Repo/contents/$escapedRemotePath" --input -
Write-Host "Uploaded $LocalPath to https://github.com/$Repo/blob/main/$RemotePath"
