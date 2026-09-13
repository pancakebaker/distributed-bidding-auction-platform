param(
    [Parameter(Mandatory = $true)][string]$KeyId,
    [string]$Environment = 'Development'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$previousEnvironment = $env:ASPNETCORE_ENVIRONMENT
$serviceRoot = Join-Path $root 'apps/bidding-service'
try {
    $env:ASPNETCORE_ENVIRONMENT = $Environment
    Push-Location $serviceRoot
    & dotnet run --project bidding-service.csproj -- revoke --key-id $KeyId
    if ($LASTEXITCODE -ne 0) {
        throw "Bidding Service credential revocation failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
    $env:ASPNETCORE_ENVIRONMENT = $previousEnvironment
}
