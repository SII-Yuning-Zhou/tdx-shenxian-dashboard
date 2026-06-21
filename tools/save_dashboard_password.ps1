param(
    [string]$PasswordFile = "",
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

$passwordFileSetting = $PasswordFile
if ([string]::IsNullOrWhiteSpace($passwordFileSetting)) {
    $passwordFileSetting = [Environment]::GetEnvironmentVariable("TDX_DASHBOARD_PASSWORD_FILE", "Process")
}
if ([string]::IsNullOrWhiteSpace($passwordFileSetting) -and $config.ContainsKey("PASSWORD_FILE")) {
    $passwordFileSetting = $config["PASSWORD_FILE"]
}
if ([string]::IsNullOrWhiteSpace($passwordFileSetting)) {
    $passwordFileSetting = "dashboard.password.txt"
}
$passwordPath = Resolve-LocalPath $passwordFileSetting $projectRoot

$securePassword = Read-Host "Enter dashboard password to save locally (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "Dashboard password cannot be empty"
    }

    Set-Content -LiteralPath $passwordPath -Value $plainPassword -Encoding UTF8 -NoNewline
    attrib +h $passwordPath 2>$null
    Write-Host "Saved dashboard password to $passwordPath"
    Write-Host "Keep this file private. It is ignored by Git."
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}
