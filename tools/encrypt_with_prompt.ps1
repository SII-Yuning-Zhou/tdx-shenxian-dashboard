param(
    [string]$InputJson = "..\tdx_shenxian_buy_alerts.json",
    [string]$OutputJson = "public\data\latest.enc.json"
)

$securePassword = Read-Host "Enter dashboard password (input is hidden)" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "Dashboard password cannot be empty"
    }

    $env:TDX_DASHBOARD_VIEW_PASSWORD = $plainPassword
    node .\tools\encrypt_snapshot.mjs $InputJson $OutputJson
}
finally {
    Remove-Item Env:\TDX_DASHBOARD_VIEW_PASSWORD -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}
