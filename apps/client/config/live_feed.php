<?php

return [
    'token_private_key_path' => env('LIVE_FEED_ADMIN_TOKEN_PRIVATE_KEY_PATH', storage_path('keys/live-feed-admin-private.pem')),
    'token_issuer' => env('LIVE_FEED_ADMIN_TOKEN_ISSUER', 'auction-client'),
    'token_audience' => env('LIVE_FEED_ADMIN_TOKEN_AUDIENCE', 'live-feed-admin'),
    'token_ttl_seconds' => (int) env('LIVE_FEED_ADMIN_TOKEN_TTL_SECONDS', 600),
    'service_url' => rtrim(env('LIVE_FEED_SERVICE_URL', 'http://localhost:3001'), '/'),
];
