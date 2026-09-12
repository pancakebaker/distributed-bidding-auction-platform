param(
    [string]$OutputDirectory = (Join-Path (Split-Path -Parent $PSScriptRoot) '.local/auth-keys')
)

$ErrorActionPreference = 'Stop'
$privateKeyPath = Join-Path $OutputDirectory 'system-admin-private.pem'
$publicKeyPath = Join-Path $OutputDirectory 'system-admin-public.pem'

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw "Required command 'openssl' was not found on PATH. Install OpenSSL and rerun this script."
}

foreach ($path in @($privateKeyPath, $publicKeyPath)) {
    if (Test-Path -LiteralPath $path) {
        throw "Refusing to overwrite an existing key: $path"
    }
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out $privateKeyPath
openssl rsa -pubout -in $privateKeyPath -out $publicKeyPath

Write-Host 'Generated local system-admin RSA keys in a neutral output directory.'
Write-Host "Private key: $privateKeyPath"
Write-Host "Public key:  $publicKeyPath"
Write-Host 'Configure the private key for Operations Portal and the public key for Live Feed.'
Write-Host 'The output directory is ignored by Git; do not commit either key.'
