<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\BiddingServiceTokenIssuer;
use Database\Seeders\LocalBidderSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthFoundationTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKeyPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->privateKeyPath = storage_path('framework/testing/bidding-service-private.pem');
        $directory = dirname($this->privateKeyPath);
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }

        $process = proc_open(
            'openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out '.escapeshellarg($this->privateKeyPath),
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
        );
        $exitCode = is_resource($process) ? proc_close($process) : 1;
        $this->assertSame(0, $exitCode);
        config([
            'bidding_service.token_private_key_path' => $this->privateKeyPath,
            'bidding_service.token_issuer' => 'dbap-laravel',
            'bidding_service.token_audience' => 'dbap-bidding-service',
            'bidding_service.token_key_id' => 'bidding-service-test-v1',
            'bidding_service.token_ttl_seconds' => 300,
        ]);
    }

    protected function tearDown(): void
    {
        @unlink($this->privateKeyPath);
        parent::tearDown();
    }

    public function test_local_bidder_seeder_is_idempotent_and_creates_non_admin_subjects(): void
    {
        $this->seed(LocalBidderSeeder::class);
        $this->seed(LocalBidderSeeder::class);

        $bidders = User::query()->whereIn('email', [
            'bidder1@example.test',
            'bidder2@example.test',
            'bidder3@example.test',
        ])->get();

        $this->assertCount(3, $bidders);
        $this->assertSame(3, $bidders->pluck('subject_id')->filter()->unique()->count());
        $this->assertTrue($bidders->every(fn (User $user): bool => ! $user->is_admin));
        $this->assertTrue(Hash::check(
            (string) env('DEMO_BIDDER_PASSWORD', LocalBidderSeeder::DEFAULT_PASSWORD),
            (string) $bidders->first()->password,
        ));
    }

    public function test_seeded_bidder_can_login_but_cannot_access_admin(): void
    {
        $this->seed(LocalBidderSeeder::class);
        $password = (string) env('DEMO_BIDDER_PASSWORD', LocalBidderSeeder::DEFAULT_PASSWORD);

        $this->post('/login', [
            'email' => 'bidder1@example.test',
            'password' => $password,
        ])->assertRedirect('/auctions');

        $this->get('/admin')->assertForbidden();
    }

    public function test_bidding_service_token_uses_stable_subject_and_server_permissions(): void
    {
        $bidder = User::factory()->create(['is_admin' => false]);
        $admin = User::factory()->admin()->create();
        $issuer = app(BiddingServiceTokenIssuer::class);

        $bidderPayload = $this->payload($issuer->issue($bidder)['token']);
        $adminPayload = $this->payload($issuer->issue($admin)['token']);

        $this->assertSame($bidder->getSubjectId(), $bidderPayload['sub']);
        $this->assertSame('dbap-laravel', $bidderPayload['iss']);
        $this->assertSame('dbap-bidding-service', $bidderPayload['aud']);
        $this->assertSame('bidding-service-test-v1', $this->header($issuer->issue($bidder)['token'])['kid']);
        $this->assertSame(['auction.bid', 'auction.buy'], $bidderPayload['permissions']);
        $this->assertNotContains('auction.manage', $bidderPayload['permissions']);
        $this->assertContains('auction.manage', $adminPayload['permissions']);
        $this->assertLessThanOrEqual(300, $bidderPayload['exp'] - $bidderPayload['iat']);
        $this->assertNotSame($bidderPayload['jti'], $adminPayload['jti']);
    }

    /** @return array<string, mixed> */
    private function payload(string $token): array
    {
        $encoded = explode('.', $token)[1];
        $json = base64_decode(strtr($encoded, '-_', '+/'), true);

        return json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
    }

    /** @return array<string, mixed> */
    private function header(string $token): array
    {
        $encoded = explode('.', $token)[0];
        $json = base64_decode(strtr($encoded, '-_', '+/'), true);

        return json_decode((string) $json, true, 512, JSON_THROW_ON_ERROR);
    }
}
