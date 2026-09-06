param(
    [switch]$ClosedScreenshot
)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$container = 'dbap-postgres'
$database = $env:POSTGRES_DB
if ([string]::IsNullOrWhiteSpace($database)) { $database = 'auction_demo' }
$user = $env:POSTGRES_USER
if ([string]::IsNullOrWhiteSpace($user)) { $user = 'auction_app' }

if ($ClosedScreenshot) {
    $shortAuctionSql = @"
('44444444-4444-4444-4444-444444444444','Short Demo Auction','Closed screenshot state produced from deterministic local demo data.',1000,50,2100,'Bob',now() - interval '10 minutes',now() - interval '1 minute','Closed',6,now(),now())
"@
    $shortAuctionBidsSql = @"
,
('44444444-4444-4444-8444-444444444441','44444444-4444-4444-4444-444444444444','Alice',1950,now() - interval '8 minutes'),
('44444444-4444-4444-8444-444444444442','44444444-4444-4444-4444-444444444444','Bob',2100,now() - interval '6 minutes')
"@
} else {
    $shortAuctionSql = @"
('44444444-4444-4444-4444-444444444444','Short Demo Auction','Short-running auction for automatic close and winner lifecycle demos.',1000,50,NULL,NULL,now() - interval '1 minute',now() + interval '45 seconds','Open',1,now(),now())
"@
    $shortAuctionBidsSql = ''
}

$sql = @"
BEGIN;
DELETE FROM outbox_messages;
DELETE FROM bids;
DELETE FROM auctions;

INSERT INTO auctions (id,title,description,starting_price,minimum_bid_increment,current_bid_amount,current_bidder_id,start_time_utc,end_time_utc,status,version,created_at_utc,updated_at_utc)
VALUES
('11111111-1111-1111-1111-111111111111','MacBook Pro','Open demo auction with live competing bid history for screenshot and interview walkthroughs.',1000,50,1900,'Bob',now() - interval '10 minutes',now() + interval '8 minutes','Open',5,now(),now()),
('22222222-2222-2222-2222-222222222222','Camera','Scheduled demo auction that has not opened yet.',2500,100,NULL,NULL,now() + interval '1 hour',now() + interval '2 hours','Scheduled',1,now(),now()),
('33333333-3333-3333-3333-333333333333','Gaming Console','Closed demo auction with accepted historical bids.',300,20,380,'Diana',now() - interval '2 hours',now() - interval '1 hour','Closed',3,now(),now()),
$shortAuctionSql;

INSERT INTO bids (id,auction_id,bidder_id,amount,created_at_utc)
VALUES
('11111111-1111-4111-8111-111111111751','11111111-1111-1111-1111-111111111111','Alice',1750,now() - interval '7 minutes'),
('11111111-1111-4111-8111-111111111802','11111111-1111-1111-1111-111111111111','Bob',1800,now() - interval '6 minutes'),
('11111111-1111-4111-8111-111111111853','11111111-1111-1111-1111-111111111111','Alice',1850,now() - interval '5 minutes'),
('11111111-1111-4111-8111-111111111904','11111111-1111-1111-1111-111111111111','Bob',1900,now() - interval '4 minutes'),
('33333333-3333-4333-8333-333333333331','33333333-3333-3333-3333-333333333333','Alice',340,now() - interval '90 minutes'),
('33333333-3333-4333-8333-333333333332','33333333-3333-3333-3333-333333333333','Diana',380,now() - interval '80 minutes')
$shortAuctionBidsSql;
COMMIT;
"@

$sql | docker exec -i $container psql -U $user -d $database -v ON_ERROR_STOP=1
$redisClear = "for _,k in ipairs(redis.call('keys','live-feed:*')) do redis.call('del',k) end return 1"
docker exec dbap-redis redis-cli EVAL $redisClear 0 | Out-Null

foreach ($queue in @('live-feed.bid-events', 'live-feed.bid-events.dlq', 'auction.events.debug')) {
    docker exec dbap-rabbitmq rabbitmqctl purge_queue $queue 2>$null | Out-Null
}

if ($ClosedScreenshot) {
    Write-Host 'Local demo data reset with closed screenshot state. This script is for development/demo databases only.'
} else {
    Write-Host 'Local demo data reset. This script is for development/demo databases only.'
}
