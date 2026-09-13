<?php

namespace App\Support;

use Illuminate\Support\Facades\Log;
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
        $bypass = (bool) config('bidding_service.client_assertion_production_bypass', false);

        if (! $enabled && ! $bypass) {
            throw new RuntimeException(
                'Client assertion issuance must be enabled in production. '
                .'Set BIDDING_SERVICE_CLIENT_ASSERTION_PRODUCTION_BYPASS=true only for a temporary migration override.',
            );
        }

        if (! $enabled) {
            Log::critical(
                'Client assertion issuance is disabled in production by the temporary '
                .'BIDDING_SERVICE_CLIENT_ASSERTION_PRODUCTION_BYPASS override. '
                .'Tenant-facing requests are not protected; remove the override after migration.',
            );

            return;
        }

        app(ClientAssertionIssuer::class)->validateConfiguration();
        app(TenantContext::class)->id();
    }
}
