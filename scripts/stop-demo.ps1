param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path

Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and
    ($_.CommandLine -like "*$root*apps/bidding-service*" -or
     $_.CommandLine -like "*$root*workers/outbox-publisher*" -or
     $_.CommandLine -like "*$root*workers/auction-scheduler*" -or
     $_.CommandLine -like "*$root*apps/live-feed-service*" -or
     $_.CommandLine -like "*$root*apps/client*artisan serve*")
} | ForEach-Object {
    Write-Host "Stopping process $($_.ProcessId): $($_.Name)"
    Stop-Process -Id $_.ProcessId -Force
}