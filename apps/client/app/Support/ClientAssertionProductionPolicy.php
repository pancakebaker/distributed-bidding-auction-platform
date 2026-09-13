<?php

namespace App\Support;

use RuntimeException;

/**
 * Enforces the temporary client-assertion rollout policy for production.
 */
final class ClientAssertionProductionPolicy
{
    public function enforce(): void
    {
        if ((string) config('app.env') !== 'production') {
            return;
        }

        $enabled = (bool) config('bidding_service.client_assertion_enabled', false);
        if (! $enabled) {
            throw new RuntimeException(
                'Client assertion issuance must be enabled in production. '
                .'Configure BIDDING_SERVICE_CLIENT_ASSERTION_ENABLED=true before serving production traffic.',
            );
        }

        app(ClientAssertionIssuer::class)->validateConfiguration();
        app(TenantContext::class)->id();
    }
}
