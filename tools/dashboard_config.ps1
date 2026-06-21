function Resolve-LocalPath([string]$PathValue, [string]$BasePath) {
    if ([string]::IsNullOrWhiteSpace($PathValue)) {
        return $PathValue
    }
    if ([IO.Path]::IsPathRooted($PathValue)) {
        return $PathValue
    }
    return Join-Path $BasePath $PathValue
}

function Read-DashboardConfig([string]$PathValue) {
    $settings = @{}
    if ([string]::IsNullOrWhiteSpace($PathValue) -or -not (Test-Path -LiteralPath $PathValue)) {
        return $settings
    }
    foreach ($rawLine in Get-Content -LiteralPath $PathValue) {
        $line = $rawLine.Trim()
        if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
            continue
        }
        $separator = $line.IndexOf("=")
        $key = $line.Substring(0, $separator).Trim().ToUpperInvariant()
        $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
        if ($key) {
            $settings[$key] = $value
        }
    }
    return $settings
}

function Get-DashboardSetting(
    [hashtable]$Config,
    [string]$ExplicitValue,
    [string]$EnvName,
    [string]$ConfigName,
    [string]$DefaultValue = ""
) {
    if (-not [string]::IsNullOrWhiteSpace($ExplicitValue)) {
        return $ExplicitValue
    }
    $envValue = [Environment]::GetEnvironmentVariable($EnvName, "Process")
    if (-not [string]::IsNullOrWhiteSpace($envValue)) {
        return $envValue
    }
    if ($Config.ContainsKey($ConfigName) -and -not [string]::IsNullOrWhiteSpace($Config[$ConfigName])) {
        return $Config[$ConfigName]
    }
    return $DefaultValue
}
