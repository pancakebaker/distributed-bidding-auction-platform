<?php

namespace App\Support;

use Illuminate\Support\Str;
use RuntimeException;

/**
 * Resolves the immutable tenant represented by this Laravel installation.
 */
final class TenantContext
{
    public function id(): string
    {
        $configured = trim((string) config('tenant.id'));
        $environment = (string) config('app.env');
        if ($configured === '' && in_array($environment, ['local', 'testing'], true)) {
            $configured = (string) config('tenant.fallback_id');
        }

        if ($configured === '' || ! Str::isUuid($configured)) {
            throw new RuntimeException(
                'TENANT_ID must be configured as a valid UUID outside local/testing environments.',
            );
        }

        return strtolower($configured);
    }
}
