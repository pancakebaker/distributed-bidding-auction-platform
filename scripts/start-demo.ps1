param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

function Assert-Command {
    param([Parameter(Mandatory = $true)][string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command '$Name' was not found on PATH."
    }
}

function Assert-Path {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description is missing: $Path"
    }
}

function Start-DemoProcess {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    Start-Process powershell -WorkingDirectory $WorkingDirectory -ArgumentList @(
        '-NoExit',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    ) | Out-Null
}

Set-Location $root

foreach ($command in @('docker', 'dotnet', 'node', 'npm', 'php')) {
    Assert-Command -Name $command
}

Assert-Path -Path (Join-Path $root '.env') -Description 'Repository-root .env file'
Assert-Path -Path (Join-Path $root 'apps/client/.env') -Description 'Laravel apps/client/.env file'
Assert-Path -Path (Join-Path $root 'apps/live-feed-service/node_modules') -Description 'Live Feed Node dependencies'
Assert-Path -Path (Join-Path $root 'apps/client/vendor') -Description 'Laravel Composer dependencies'
Assert-Path -Path (Join-Path $root 'apps/client/node_modules') -Description 'Laravel client Node dependencies'

docker compose up -d

Start-DemoProcess -Title 'DBAP Bidding Service' -WorkingDirectory $root -Command 'dotnet run --project apps/bidding-service/bidding-service.csproj --launch-profile http'
Start-DemoProcess -Title 'DBAP Outbox Publisher' -WorkingDirectory $root -Command 'dotnet run --project workers/outbox-publisher/outbox-publisher.csproj'
Start-DemoProcess -Title 'DBAP Auction Scheduler' -WorkingDirectory $root -Command 'dotnet run --project workers/auction-scheduler/auction-scheduler.csproj'
Start-DemoProcess -Title 'DBAP Live Feed Service' -WorkingDirectory (Join-Path $root 'apps/live-feed-service') -Command 'npm run dev'
Start-DemoProcess -Title 'DBAP Laravel Client' -WorkingDirectory (Join-Path $root 'apps/client') -Command 'php artisan serve --host=127.0.0.1 --port=8000'
Start-DemoProcess -Title 'DBAP Laravel Vite' -WorkingDirectory (Join-Path $root 'apps/client') -Command 'npm run dev -- --host=127.0.0.1'

Write-Host 'Development demo processes started in separate PowerShell windows.'
Write-Host 'Client: http://localhost:8000/auctions'
Write-Host 'Bidding API: http://localhost:5000/swagger'
Write-Host 'RabbitMQ management: http://localhost:15672'
