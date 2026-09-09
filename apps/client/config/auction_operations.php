<?php

return [
    'portal_url' => rtrim((string) env('AUCTION_OPERATIONS_PORTAL_URL', 'http://localhost:5099'), '/'),
    'handoff_url' => rtrim((string) env('AUCTION_OPERATIONS_PORTAL_URL', 'http://localhost:5099'), '/').'/auth/handoff',
    'admin_url' => (string) env('AUCTION_OPERATIONS_LARAVEL_ADMIN_URL', '/admin'),
    'token_private_key_path' => env('AUCTION_OPERATIONS_TOKEN_PRIVATE_KEY_PATH', storage_path('keys/live-feed-admin-private.pem')),
    'token_issuer' => env('AUCTION_OPERATIONS_TOKEN_ISSUER', 'auction-client'),
    'token_audience' => env('AUCTION_OPERATIONS_TOKEN_AUDIENCE', 'auction-operations-portal'),
    'token_permission' => env('AUCTION_OPERATIONS_TOKEN_PERMISSION', 'access-auction-operations'),
    'token_ttl_seconds' => (int) env('AUCTION_OPERATIONS_TOKEN_TTL_SECONDS', 300),
];
