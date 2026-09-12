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

function Test-ListeningPort {
    param([Parameter(Mandatory = $true)][int]$Port)

    return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Wait-ForPortal {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [int]$Attempts = 15
    )

    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "Auction Operations Portal is healthy: $Url"
                return
            }
        }
        catch {
            # The portal may still be starting or its dependency health checks may not be ready.
        }

        Start-Sleep -Seconds 1
    }

    throw "Auction Operations Portal did not become healthy at $Url. Run 'dotnet restore' and 'dotnet build apps/auction-operations-portal', then rerun start-demo.ps1."
}

function Get-ComposeConfiguration {
    $output = @(docker compose config --format json 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "[ERROR] Unable to resolve Docker Compose configuration: $($output -join ' ')"
    }

    return (($output | ForEach-Object { $_.ToString() }) -join "`n" | ConvertFrom-Json)
}

function Ensure-CompatibleContainer {
    param(
        [Parameter(Mandatory = $true)]$Definition
    )

    $inspectOutput = @(docker inspect $Definition.Name 2>$null)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[OK] $($Definition.Name) does not exist; Compose will create it."
        return $false
    }

    try {
        $container = (($inspectOutput | ForEach-Object { $_.ToString() }) -join "`n" | ConvertFrom-Json)[0]
    }
    catch {
        throw "[ERROR] Could not inspect existing container '$($Definition.Name)'."
    }

    if ($container.Config.Image -ne $Definition.Image) {
        throw "[ERROR] $($Definition.Name) exists with image '$($container.Config.Image)', expected '$($Definition.Image)'."
    }

    $composeServiceLabel = $container.Config.Labels.PSObject.Properties['com.docker.compose.service']
    if ($null -ne $composeServiceLabel -and $composeServiceLabel.Value -ne $Definition.Service) {
        throw "[ERROR] $($Definition.Name) belongs to Compose service '$($composeServiceLabel.Value)', expected '$($Definition.Service)'."
    }

    foreach ($port in @($Definition.Ports)) {
        $portKey = "$($port.Target)/$($port.Protocol)"
        $bindingProperty = $container.NetworkSettings.Ports.PSObject.Properties[$portKey]
        $hostPorts = @()
        if ($null -ne $bindingProperty -and $null -ne $bindingProperty.Value) {
            $hostPorts = @($bindingProperty.Value | ForEach-Object { [string]$_.HostPort })
        }

        if ($hostPorts -notcontains ([string]$port.Published)) {
            throw "[ERROR] $($Definition.Name) has an incompatible $portKey binding. Expected host port $($port.Published), found $($hostPorts -join ', ')."
        }
    }

    if ($container.State.Running) {
        Write-Host "[WARN] $($Definition.Name) already exists and is running; reusing it."
    }
    else {
        Write-Host "[WARN] $($Definition.Name) already exists but is stopped; starting and reusing it."
        docker start $Definition.Name | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "[ERROR] Failed to start compatible existing container '$($Definition.Name)'."
        }
    }

    return $true
}

Set-Location $root
$authKeyDirectory = Join-Path $root '.local/auth-keys'
$privateKeyPath = Join-Path $authKeyDirectory 'system-admin-private.pem'
$publicKeyPath = Join-Path $authKeyDirectory 'system-admin-public.pem'

foreach ($command in @('docker', 'dotnet', 'node', 'npm', 'php')) {
    Assert-Command -Name $command
}

Assert-Path -Path (Join-Path $root '.env') -Description 'Repository-root .env file'
Assert-Path -Path $privateKeyPath -Description 'system-admin private key'
Assert-Path -Path $publicKeyPath -Description 'Live Feed system-admin public key'
Assert-Path -Path (Join-Path $root 'apps/client/.env') -Description 'Laravel apps/client/.env file'
Assert-Path -Path (Join-Path $root 'apps/live-feed-service/node_modules') -Description 'Live Feed Node dependencies'
Assert-Path -Path (Join-Path $root 'apps/client/vendor') -Description 'Laravel Composer dependencies'
Assert-Path -Path (Join-Path $root 'apps/client/node_modules') -Description 'Laravel client Node dependencies'
Assert-Path -Path (Join-Path $root 'apps/auction-operations-portal/AuctionOperationsPortal.csproj') -Description 'Auction Operations Portal project'
Assert-Path -Path (Join-Path $root 'apps/auction-operations-portal/appsettings.json') -Description 'Auction Operations Portal configuration'
Assert-Path -Path (Join-Path $root 'apps/auction-operations-portal/obj/project.assets.json') -Description 'Auction Operations Portal restored assets'

$compose = Get-ComposeConfiguration
$infrastructure = @(
    [pscustomobject]@{
        Service = 'postgres'
        Name = $compose.services.postgres.container_name
        Image = $compose.services.postgres.image
        Ports = @($compose.services.postgres.ports | ForEach-Object {
            [pscustomobject]@{ Target = $_.target; Published = $_.published; Protocol = $_.protocol }
        })
    },
    [pscustomobject]@{
        Service = 'rabbitmq'
        Name = $compose.services.rabbitmq.container_name
        Image = $compose.services.rabbitmq.image
        Ports = @($compose.services.rabbitmq.ports | ForEach-Object {
            [pscustomobject]@{ Target = $_.target; Published = $_.published; Protocol = $_.protocol }
        })
    },
    [pscustomobject]@{
        Service = 'redis'
        Name = $compose.services.redis.container_name
        Image = $compose.services.redis.image
        Ports = @($compose.services.redis.ports | ForEach-Object {
            [pscustomobject]@{ Target = $_.target; Published = $_.published; Protocol = $_.protocol }
        })
    }
)

$missingServices = [System.Collections.Generic.List[string]]::new()
foreach ($definition in $infrastructure) {
    if (-not (Ensure-CompatibleContainer -Definition $definition)) {
        $missingServices.Add($definition.Service)
    }
}

if ($missingServices.Count -gt 0) {
    Write-Host "[OK] Creating missing infrastructure services: $($missingServices -join ', ')"
    docker compose up -d @missingServices
    if ($LASTEXITCODE -ne 0) {
        throw '[ERROR] Docker Compose failed while creating missing infrastructure services.'
    }
}

foreach ($definition in $infrastructure) {
    [void](Ensure-CompatibleContainer -Definition $definition)
}

Start-DemoProcess -Title 'DBAP Bidding Service' -WorkingDirectory $root -Command 'dotnet run --project apps/bidding-service/bidding-service.csproj --launch-profile http'
Start-DemoProcess -Title 'DBAP Outbox Publisher' -WorkingDirectory $root -Command 'dotnet run --project workers/outbox-publisher/outbox-publisher.csproj'
Start-DemoProcess -Title 'DBAP Auction Scheduler' -WorkingDirectory $root -Command 'dotnet run --project workers/auction-scheduler/auction-scheduler.csproj'
Start-DemoProcess -Title 'DBAP Live Feed Service' -WorkingDirectory (Join-Path $root 'apps/live-feed-service') -Command "`$env:SYSTEM_ADMIN_TOKEN_PUBLIC_KEY_PATH = '$publicKeyPath'; npm run dev"
Start-DemoProcess -Title 'DBAP Laravel Client' -WorkingDirectory (Join-Path $root 'apps/client') -Command 'php artisan serve --host=127.0.0.1 --port=8000'
Start-DemoProcess -Title 'DBAP Laravel Vite' -WorkingDirectory (Join-Path $root 'apps/client') -Command 'npm run dev -- --host=127.0.0.1'

$portalUrl = 'http://localhost:5099'
$portalHealthUrl = "$portalUrl/health"
if (Test-ListeningPort -Port 5099) {
    Write-Host "Auction Operations Portal is already listening: $portalUrl"
}
else {
    Start-DemoProcess -Title 'DBAP Auction Operations Portal' -WorkingDirectory $root -Command "`$env:ASPNETCORE_ENVIRONMENT = 'Development'; `$env:DOTNET_ENVIRONMENT = 'Development'; dotnet run --no-restore --project apps/auction-operations-portal --urls http://localhost:5099"
}

Wait-ForPortal -Url $portalHealthUrl

Write-Host 'Development demo processes started in separate PowerShell windows.'
Write-Host 'Client: http://localhost:8000/auctions'
Write-Host 'Laravel tenant admin: http://localhost:8000/admin'
Write-Host 'Bidding API: http://localhost:5000/swagger'
Write-Host "Operations Portal login: $portalUrl/login"
Write-Host "Operations live activity: $portalUrl/activity/live"
Write-Host 'Sign in to the Operations Portal directly; it has its own SystemAdministrator identity.'
Write-Host 'RabbitMQ management: http://localhost:15672'
Write-Host '[WARN] Redis, RabbitMQ, and PostgreSQL may be shared with another checkout when compatible containers are reused. Use docker compose down for an isolated stack.'
