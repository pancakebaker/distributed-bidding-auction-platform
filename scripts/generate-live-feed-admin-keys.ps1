param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$privateKeyPath = Join-Path $root 'apps/client/storage/keys/live-feed-admin-private.pem'
$publicKeyPath = Join-Path $root 'apps/live-feed-service/config/live-feed-admin-public.pem'

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
    throw "Required command 'openssl' was not found on PATH. Install OpenSSL and rerun this script."
}

foreach ($path in @($privateKeyPath, $publicKeyPath)) {
    if (Test-Path -LiteralPath $path) {
        throw "Refusing to overwrite an existing key: $path"
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $privateKeyPath) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $publicKeyPath) | Out-Null

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out $privateKeyPath
openssl rsa -pubout -in $privateKeyPath -out $publicKeyPath

Write-Host 'Generated local Laravel-to-Live Feed RSA keys.'
Write-Host "Private key: $privateKeyPath"
Write-Host "Public key:  $publicKeyPath"
Write-Host 'Both paths are ignored by Git; do not commit either key.'
