<?php

return [
    'token_private_key_path' => env(
        'BIDDING_SERVICE_TOKEN_PRIVATE_KEY_PATH',
        storage_path('keys/bidding-service-private.pem'),
    ),
    'token_issuer' => env('BIDDING_SERVICE_TOKEN_ISSUER', 'dbap-laravel'),
    'token_audience' => env('BIDDING_SERVICE_TOKEN_AUDIENCE', 'dbap-bidding-service'),
    'token_key_id' => env('BIDDING_SERVICE_TOKEN_KEY_ID', 'bidding-service-v1'),
    'token_ttl_seconds' => (int) env('BIDDING_SERVICE_TOKEN_TTL_SECONDS', 300),
];
