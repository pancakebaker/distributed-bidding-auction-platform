<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LiveFeedAdminTokenTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKeyPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $directory = storage_path('framework/testing/live-feed-keys');
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }
        $this->privateKeyPath = $directory.'/private.pem';
        $process = proc_open('openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out '.escapeshellarg($this->privateKeyPath), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $exitCode = is_resource($process) ? proc_close($process) : 1;
        $this->assertSame(0, $exitCode);
        $this->assertFileExists($this->privateKeyPath);
        config(['live_feed.token_private_key_path' => $this->privateKeyPath, 'live_feed.token_issuer' => 'auction-client', 'live_feed.token_audience' => 'live-feed-admin', 'live_feed.token_ttl_seconds' => 600]);
    }

    protected function tearDown(): void
    {
        @unlink($this->privateKeyPath);
        parent::tearDown();
    }

    public function test_admin_can_request_a_short_lived_token_without_sensitive_claims(): void
    {
        $admin = User::factory()->admin()->create();
        $response = $this->actingAs($admin)->postJson('/admin/live-feed/token');
        $response->assertOk()->assertJsonStructure(['token', 'expiresAt']);
        $payload = json_decode(base64_decode(strtr(explode('.', $response->json('token'))[1], '-_', '+/')), true, 512, JSON_THROW_ON_ERROR);
        $this->assertSame($admin->getSubjectId(), $payload['sub']);
        $this->assertSame('auction-client', $payload['iss']);
        $this->assertSame('live-feed-admin', $payload['aud']);
        $this->assertSame('admin', $payload['role']);
        $this->assertSame(['access-live-feed-admin'], $payload['permissions']);
        $this->assertIsInt($payload['iat']);
        $this->assertIsInt($payload['exp']);
        $this->assertIsString($payload['jti']);
        $this->assertNotSame('', $payload['jti']);
        $this->assertArrayNotHasKey('password', $payload);
    }

    public function test_handoff_form_uses_configured_service_and_token_exchange_path(): void
    {
        $admin = User::factory()->admin()->create();
        config(['live_feed.service_url' => 'https://live-feed.example.test']);

        $this->actingAs($admin)
            ->get('/admin/live-feed')
            ->assertOk()
            ->assertSee('action="https://live-feed.example.test/admin/auth/token"', false);
    }

    public function test_non_admin_and_guest_cannot_request_a_token(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/admin/live-feed/token')->assertForbidden();
        $this->postJson('/admin/live-feed/token')->assertForbidden();
    }
}
