<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Tests\TestCase;

class AuctionCommandBffTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKeyPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        $this->privateKeyPath = storage_path('testing-bff-private-'.Str::uuid().'.pem');
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
        config()->set('bidding_service.token_private_key_path', $this->privateKeyPath);
        config()->set('bidding_service.token_issuer', 'dbap-laravel');
        config()->set('bidding_service.token_audience', 'dbap-bidding-service');
        config()->set('bidding_service.token_key_id', 'bidding-service-test-v1');
    }

    protected function tearDown(): void
    {
        @unlink($this->privateKeyPath);
        parent::tearDown();
    }

    public function test_authenticated_bid_proxy_uses_session_identity_and_forwards_only_amount(): void
    {
        $user = User::factory()->create(['name' => 'Bidder One']);
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response([
                'bidId' => 'bid-1',
                'auctionId' => 'auction-1',
                'bidderId' => 'subject-1',
                'amount' => 125,
            ], 201);
        });

        $response = $this->actingAs($user)->postJson(
            '/api/auctions/auction-1/bids',
            ['amount' => 125, 'bidderId' => 'attacker'],
            ['X-Correlation-ID' => 'bff-correlation'],
        );

        $response->assertCreated();
        $this->assertNotNull($seen);
        $this->assertStringStartsWith('Bearer ', (string) $seen->header('Authorization')[0]);
        $this->assertSame(['amount' => 125], $seen->data());
        $this->assertSame('bff-correlation', $seen->header('X-Correlation-ID')[0]);
    }

    public function test_authenticated_buy_now_proxy_sends_empty_command_body(): void
    {
        $user = User::factory()->create();
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response(['auctionId' => 'auction-1'], 201);
        });

        $response = $this->actingAs($user)->postJson(
            '/api/auctions/auction-1/buy-now',
            ['bidderId' => 'attacker', 'price' => 1],
        );

        $response->assertCreated();
        $this->assertNotNull($seen);
        $this->assertSame([], $seen->data());
        $this->assertStringStartsWith('Bearer ', (string) $seen->header('Authorization')[0]);
    }

    public function test_anonymous_command_requests_are_rejected_by_laravel_authentication(): void
    {
        $this->postJson('/api/auctions/auction-1/bids', ['amount' => 125])
            ->assertUnauthorized();
        $this->postJson('/api/auctions/auction-1/buy-now')
            ->assertUnauthorized();
    }

    public function test_admin_management_proxy_requires_admin_and_forwards_expected_version(): void
    {
        $admin = User::factory()->admin()->create();
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response(['id' => 'auction-1', 'version' => 2], 200);
        });

        $response = $this->actingAs($admin)->putJson(
            '/admin/api/auctions/auction-1',
            [
                'title' => 'Updated',
                'description' => 'Updated description',
                'saleMode' => 'AuctionOnly',
                'startingPrice' => 100,
                'minimumBidIncrement' => 10,
                'buyNowPrice' => null,
                'startTimeUtc' => '2099-09-12T10:00:00Z',
                'endTimeUtc' => '2099-09-12T12:00:00Z',
                'version' => 1,
                'status' => 'Closed',
            ],
            ['X-Correlation-ID' => 'management-correlation'],
        );

        $response->assertOk();
        $this->assertNotNull($seen);
        $this->assertStringStartsWith('Bearer ', (string) $seen->header('Authorization')[0]);
        $this->assertSame(1, $seen->data()['version']);
        $this->assertArrayNotHasKey('status', $seen->data());
        $this->assertSame('management-correlation', $seen->header('X-Correlation-ID')[0]);
    }

    public function test_non_admin_bidder_cannot_use_management_proxy(): void
    {
        $bidder = User::factory()->create(['is_admin' => false]);

        $this->actingAs($bidder)
            ->postJson('/admin/api/auctions', [])
            ->assertForbidden();
    }
}
