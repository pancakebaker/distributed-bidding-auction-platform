<?php

namespace Tests\Feature;

use App\Support\TenantContext;
use RuntimeException;
use Tests\TestCase;

class TenantContextTest extends TestCase
{
    public function test_local_context_uses_the_deterministic_demo_fallback(): void
    {
        config([
            'app.env' => 'local',
            'tenant.id' => null,
        ]);

        $this->assertSame(
            'aaaaaaaa-1111-4111-8111-111111111111',
            app(TenantContext::class)->id(),
        );
    }

    public function test_non_local_context_requires_a_valid_configured_uuid(): void
    {
        config([
            'app.env' => 'production',
            'tenant.id' => null,
        ]);

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('TENANT_ID must be configured');

        app(TenantContext::class)->id();
    }
}
