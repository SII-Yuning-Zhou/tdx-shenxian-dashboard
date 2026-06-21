param(
    [ValidateSet("live", "once", "backtest", "replay", "replay3")]
    [string]$Mode = "live",
    [string]$PasswordFile = "",
    [string]$AutoUpload = "",
    [string]$ConfigFile = ""
)

$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")
$userRoot = Resolve-Path -LiteralPath (Join-Path $projectRoot "..")
$tdxScript = Join-Path $userRoot "tdx_shenxian_quant.py"
. (Join-Path $PSScriptRoot "dashboard_config.ps1")

if (-not (Test-Path -LiteralPath $tdxScript)) {
    throw "Cannot find TDX script: $tdxScript"
}

$configFileSetting = $ConfigFile
if ([string]::IsNullOrWhiteSpace($configFileSetting)) {
    $configFileSetting = [Environment]::GetEnvironmentVariable("TDX_DASHBOARD_CONFIG_FILE", "Process")
}
if ([string]::IsNullOrWhiteSpace($configFileSetting)) {
    $configFileSetting = "dashboard.config.txt"
}
$configPath = Resolve-LocalPath $configFileSetting $projectRoot
$config = Read-DashboardConfig $configPath

$existingPassword = [Environment]::GetEnvironmentVariable("TDX_DASHBOARD_VIEW_PASSWORD", "Process")
$passwordFileSetting = Get-DashboardSetting $config $PasswordFile "TDX_DASHBOARD_PASSWORD_FILE" "PASSWORD_FILE" "dashboard.password.txt"
$passwordPath = Resolve-LocalPath $passwordFileSetting $projectRoot
$autoUploadSetting = Get-DashboardSetting $config $AutoUpload "TDX_DASHBOARD_AUTO_UPLOAD" "AUTO_UPLOAD" "1"
$repoSetting = Get-DashboardSetting $config "" "TDX_DASHBOARD_GITHUB_REPO" "GITHUB_REPO" ""
$remotePathSetting = Get-DashboardSetting $config "" "TDX_DASHBOARD_REMOTE_PATH" "REMOTE_PATH" ""

$bstr = [IntPtr]::Zero
$envNames = @(
    "TDX_DASHBOARD_VIEW_PASSWORD",
    "TDX_DASHBOARD_AUTO_UPLOAD",
    "TDX_DASHBOARD_CONFIG_FILE",
    "TDX_DASHBOARD_PASSWORD_FILE",
    "TDX_DASHBOARD_GITHUB_REPO",
    "TDX_DASHBOARD_REMOTE_PATH"
)
$oldEnv = @{}
foreach ($name in $envNames) {
    $oldEnv[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

try {
    if (-not [string]::IsNullOrWhiteSpace($existingPassword)) {
        $plainPassword = $existingPassword
    }
    elseif (Test-Path -LiteralPath $passwordPath) {
        $plainPassword = (Get-Content -Raw -LiteralPath $passwordPath).Trim()
    }
    else {
        $securePassword = Read-Host "Enter dashboard password (input is hidden)" -AsSecureString
        $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
        $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    }

    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "Dashboard password cannot be empty"
    }

    $env:TDX_DASHBOARD_VIEW_PASSWORD = $plainPassword
    $env:TDX_DASHBOARD_AUTO_UPLOAD = $autoUploadSetting
    $env:TDX_DASHBOARD_CONFIG_FILE = $configPath
    $env:TDX_DASHBOARD_PASSWORD_FILE = $passwordPath
    if (-not [string]::IsNullOrWhiteSpace($repoSetting)) {
        $env:TDX_DASHBOARD_GITHUB_REPO = $repoSetting
    }
    if (-not [string]::IsNullOrWhiteSpace($remotePathSetting)) {
        $env:TDX_DASHBOARD_REMOTE_PATH = $remotePathSetting
    }

    python $tdxScript $Mode
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    foreach ($name in $envNames) {
        [Environment]::SetEnvironmentVariable($name, $oldEnv[$name], "Process")
    }
}
