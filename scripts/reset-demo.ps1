param()

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

$container = 'dbap-postgres'
$database = $env:POSTGRES_DB
if ([string]::IsNullOrWhiteSpace($database)) { $database = 'auction_demo' }
$user = $env:POSTGRES_USER
if ([string]::IsNullOrWhiteSpace($user)) { $user = 'auction_app' }

$sql = @"
BEGIN;
DELETE FROM outbox_messages;
DELETE FROM bids;
DELETE FROM auctions;

INSERT INTO auctions (id,title,description,starting_price,minimum_bid_increment,current_bid_amount,current_bidder_id,start_time_utc,end_time_utc,status,version,created_at_utc,updated_at_utc)
VALUES
('11111111-1111-1111-1111-111111111111','MacBook Pro','Open demo auction for live bidding and concurrency scenarios.',10000,500,NULL,NULL,now() - interval '10 minutes',now() + interval '30 minutes','Open',1,now(),now()),
('22222222-2222-2222-2222-222222222222','Camera','Scheduled demo auction that has not opened yet.',2500,100,NULL,NULL,now() + interval '1 hour',now() + interval '2 hours','Scheduled',1,now(),now()),
('33333333-3333-3333-3333-333333333333','Gaming Console','Closed demo auction with accepted historical bids.',300,20,380,'diana',now() - interval '2 hours',now() - interval '1 hour','Closed',3,now(),now()),
('44444444-4444-4444-4444-444444444444','Short Demo Auction','Short-running auction for automatic close and winner lifecycle demos.',1000,50,NULL,NULL,now() - interval '1 minute',now() + interval '45 seconds','Open',1,now(),now());

INSERT INTO bids (id,auction_id,bidder_id,amount,created_at_utc)
VALUES
('33333333-3333-4333-8333-333333333331','33333333-3333-3333-3333-333333333333','alice',340,now() - interval '90 minutes'),
('33333333-3333-4333-8333-333333333332','33333333-3333-3333-3333-333333333333','diana',380,now() - interval '80 minutes');
COMMIT;
"@

$sql | docker exec -i $container psql -U $user -d $database -v ON_ERROR_STOP=1
$redisClear = "for _,k in ipairs(redis.call('keys','live-feed:*')) do redis.call('del',k) end return 1"
docker exec dbap-redis redis-cli EVAL $redisClear 0 | Out-Null

foreach ($queue in @('live-feed.bid-events', 'live-feed.bid-events.dlq', 'auction.events.debug')) {
    docker exec dbap-rabbitmq rabbitmqctl purge_queue $queue 2>$null | Out-Null
}

Write-Host 'Local demo data reset. This script is for development/demo databases only.'