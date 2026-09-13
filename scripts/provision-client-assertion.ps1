param(
    [Parameter(Mandatory = $true)][string]$ClientId,
    [Parameter(Mandatory = $true)][string]$KeyId,
    [Parameter(Mandatory = $true)][string]$PublicKeyPath,
    [string]$Environment = 'Development',
    [string]$ValidFromUtc,
    [string]$ExpiresAtUtc
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path -LiteralPath $PublicKeyPath -PathType Leaf)) {
    throw "Public key file was not found: $PublicKeyPath"
}

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$serviceRoot = Join-Path $root 'apps/bidding-service'
try {
    $env:ASPNETCORE_ENVIRONMENT = $Environment
    Push-Location $serviceRoot
    $arguments = @(
        'run', '--project', 'bidding-service.csproj', '--',
        'provision',
        '--client-id', $ClientId,
        '--key-id', $KeyId,
        '--public-key-path', (Resolve-Path -LiteralPath $PublicKeyPath).Path
    )
    if ($ValidFromUtc) { $arguments += @('--valid-from-utc', $ValidFromUtc) }
    if ($ExpiresAtUtc) { $arguments += @('--expires-at-utc', $ExpiresAtUtc) }

    & dotnet @arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Bidding Service credential provisioning failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
}
