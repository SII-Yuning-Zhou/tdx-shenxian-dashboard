param(
    [string]$Repo = "SII-Yuning-Zhou/tdx-shenxian-dashboard",
    [string]$LocalPath = "public\data\latest.enc.json",
    [string]$RemotePath = "public/data/latest.enc.json"
)

$ErrorActionPreference = "Stop"

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
