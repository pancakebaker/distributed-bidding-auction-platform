<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuctionOperationsHandoffTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKeyPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
        $directory = storage_path('framework/testing/auction-operations-keys');
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }
        $this->privateKeyPath = $directory.'/private.pem';
        $process = proc_open('openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out '.escapeshellarg($this->privateKeyPath), [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        $exitCode = is_resource($process) ? proc_close($process) : 1;
        $this->assertSame(0, $exitCode);
        config([
            'auction_operations.token_private_key_path' => $this->privateKeyPath,
            'auction_operations.token_issuer' => 'auction-client',
            'auction_operations.token_audience' => 'auction-operations-portal',
            'auction_operations.token_permission' => 'access-auction-operations',
            'auction_operations.token_ttl_seconds' => 300,
            'auction_operations.handoff_url' => 'http://localhost:5099/auth/handoff',
        ]);
    }

    protected function tearDown(): void
    {
        @unlink($this->privateKeyPath);
        parent::tearDown();
    }

    public function test_guest_and_non_admin_cannot_enter_the_portal(): void
    {
        $this->get('/admin/auction-operations')->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->get('/admin/auction-operations')->assertForbidden();
    }

    public function test_admin_receives_a_portal_targeted_short_lived_handoff_token(): void
    {
        $admin = User::factory()->admin()->create(['email' => 'admin@example.com']);
        $response = $this->actingAs($admin)->get('/admin/auction-operations')->assertOk();
        $response->assertSee('http://localhost:5099/auth/handoff', false);

        preg_match('/name="token" value="([^"]+)"/', $response->getContent(), $matches);
        $this->assertNotEmpty($matches[1] ?? null);
        $payload = json_decode(base64_decode(strtr(explode('.', $matches[1])[1], '-_', '+/')), true, 512, JSON_THROW_ON_ERROR);

        $this->assertSame('auction-operations-portal', $payload['aud']);
        $this->assertSame(['access-auction-operations'], $payload['permissions']);
        $this->assertSame((string) $admin->id, $payload['sub']);
        $this->assertNotEmpty($payload['jti']);
        $this->assertLessThanOrEqual(300, $payload['exp'] - $payload['iat']);
        $this->assertArrayNotHasKey('password', $payload);
    }
}
