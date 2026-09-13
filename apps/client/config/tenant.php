<?php

return [
    // The fallback is development-only; production must configure TENANT_ID.
    'fallback_id' => 'aaaaaaaa-1111-4111-8111-111111111111',
    'id' => env('TENANT_ID'),
];
