param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

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
docker compose up -d

Start-DemoProcess -Title 'DBAP Bidding Service' -WorkingDirectory $root -Command 'dotnet run --project apps/bidding-service/bidding-service.csproj --launch-profile http'
Start-DemoProcess -Title 'DBAP Outbox Publisher' -WorkingDirectory $root -Command 'dotnet run --project workers/outbox-publisher/outbox-publisher.csproj'
Start-DemoProcess -Title 'DBAP Auction Scheduler' -WorkingDirectory $root -Command 'dotnet run --project workers/auction-scheduler/auction-scheduler.csproj'
Start-DemoProcess -Title 'DBAP Live Feed Service' -WorkingDirectory (Join-Path $root 'apps/live-feed-service') -Command 'npm run start'
Start-DemoProcess -Title 'DBAP Laravel Client' -WorkingDirectory (Join-Path $root 'apps/client') -Command 'php artisan serve --host=127.0.0.1 --port=8000'

Write-Host 'Demo processes started in separate PowerShell windows.'
Write-Host 'Client: http://localhost:8000/auctions'
Write-Host 'Bidding API: http://localhost:5000/swagger'
Write-Host 'RabbitMQ management: http://localhost:15672'