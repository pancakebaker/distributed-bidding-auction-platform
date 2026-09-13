<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\ClientAssertionIssuer;
use App\Support\ClientAssertionProductionPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Tests\TestCase;

class ClientAssertionIssuerTest extends TestCase
{
    use RefreshDatabase;

    private string $privateKeyPath;

    protected function setUp(): void
    {
        parent::setUp();
        $this->privateKeyPath = storage_path('testing-client-assertion-'.Str::uuid().'.pem');
        $this->generateKey($this->privateKeyPath, 2048);
        config()->set('app.env', 'testing');
        config()->set('bidding_service.client_assertion_enabled', false);
        config()->set('bidding_service.token_private_key_path', $this->privateKeyPath);
        config()->set('bidding_service.token_issuer', 'dbap-laravel');
        config()->set('bidding_service.token_audience', 'dbap-bidding-service');
        config()->set('bidding_service.token_key_id', 'bidding-service-test-v1');
        config()->set('bidding_service.client_assertion_client_id', 'local-laravel-client');
        config()->set('bidding_service.client_assertion_key_id', 'local-laravel-key-01');
        config()->set('bidding_service.client_assertion_private_key_path', $this->privateKeyPath);
        config()->set('bidding_service.client_assertion_ttl_seconds', 30);
    }

    protected function tearDown(): void
    {
        @unlink($this->privateKeyPath);
        parent::tearDown();
    }

    public function test_issuer_emits_valid_rs256_contract_and_tenant_context(): void
    {
        $result = app(ClientAssertionIssuer::class)->issue();
        [$header, $payload, $signature] = $this->decode($result['token']);

        $this->assertSame('RS256', $header['alg']);
        $this->assertSame('JWT', $header['typ']);
        $this->assertSame('local-laravel-key-01', $header['kid']);
        $this->assertSame('local-laravel-client', $payload['iss']);
        $this->assertSame('dbap-bidding-service', $payload['aud']);
        $this->assertSame(config('tenant.fallback_id'), $payload['tenant_id']);
        $this->assertIsString($payload['jti']);
        $this->assertSame($payload['iat'], $payload['nbf']);
        $this->assertSame(30, $payload['exp'] - $payload['iat']);
        $this->assertSame($payload['exp'], strtotime($result['expiresAt']));
        $this->assertSame(1, openssl_verify(
            $this->signingInput($result['token']),
            $signature,
            $this->publicKey(),
            OPENSSL_ALGO_SHA256,
        ));
    }

    public function test_each_issue_gets_a_new_jti(): void
    {
        $first = app(ClientAssertionIssuer::class)->issue();
        $second = app(ClientAssertionIssuer::class)->issue();

        $this->assertNotSame($this->decode($first['token'])[1]['jti'], $this->decode($second['token'])[1]['jti']);
    }

    public function test_invalid_configuration_fails_before_signing(): void
    {
        config()->set('bidding_service.client_assertion_client_id', 'Invalid Client');
        $this->expectException(RuntimeException::class);
        app(ClientAssertionIssuer::class)->issue();
    }

    public function test_missing_key_fails_closed(): void
    {
        config()->set('bidding_service.client_assertion_private_key_path', storage_path('missing-client-key.pem'));
        $this->expectException(RuntimeException::class);
        app(ClientAssertionIssuer::class)->issue();
    }

    public function test_weak_rsa_key_fails_closed(): void
    {
        $this->generateKey($this->privateKeyPath, 1024);

        $this->expectException(RuntimeException::class);
        app(ClientAssertionIssuer::class)->issue();
    }

    public function test_enabled_bff_request_adds_assertion_without_replacing_human_authorization(): void
    {
        config()->set('bidding_service.client_assertion_enabled', true);
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response(['bidId' => 'bid-1'], 201);
        });

        $response = $this->actingAs(User::factory()->create())->postJson(
            '/api/auctions/auction-1/bids',
            ['amount' => 125],
        );

        $response->assertCreated();
        $this->assertNotNull($seen);
        $this->assertStringStartsWith('Bearer ', (string) $seen->header('Authorization')[0]);
        $this->assertCount(1, $seen->header('X-Client-Assertion'));
        $this->assertNotSame('', $seen->header('X-Client-Assertion')[0]);
    }

    public function test_disabled_feature_preserves_existing_outbound_headers(): void
    {
        config()->set('bidding_service.client_assertion_enabled', false);
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response(['bidId' => 'bid-1'], 201);
        });

        $response = $this->actingAs(User::factory()->create())->postJson(
            '/api/auctions/auction-1/bids',
            ['amount' => 125],
        );

        $response->assertCreated();
        $this->assertNotNull($seen);
        $this->assertStringStartsWith('Bearer ', (string) $seen->header('Authorization')[0]);
        $this->assertSame([], $seen->header('X-Client-Assertion'));
    }

    public function test_each_outbound_request_gets_a_fresh_assertion(): void
    {
        config()->set('bidding_service.client_assertion_enabled', true);
        $assertions = [];
        Http::fake(function ($request) use (&$assertions) {
            $assertions[] = $request->header('X-Client-Assertion')[0] ?? '';

            return Http::response(['bidId' => 'bid-1'], 201);
        });
        $user = User::factory()->create();

        $this->actingAs($user)->postJson('/api/auctions/auction-1/bids', ['amount' => 125]);
        $this->actingAs($user)->postJson('/api/auctions/auction-1/bids', ['amount' => 126]);

        $this->assertCount(2, $assertions);
        $this->assertNotSame($this->decode($assertions[0])[1]['jti'], $this->decode($assertions[1])[1]['jti']);
    }

    public function test_enabled_public_read_also_receives_server_side_assertion(): void
    {
        config()->set('bidding_service.client_assertion_enabled', true);
        $seen = null;
        Http::fake(function ($request) use (&$seen) {
            $seen = $request;

            return Http::response(['items' => []], 200);
        });

        $this->getJson('/api/auctions')->assertOk();

        $this->assertNotNull($seen);
        $this->assertNotSame('', $seen->header('X-Client-Assertion')[0] ?? '');
    }

    public function test_production_rejects_disabled_issuance(): void
    {
        config()->set('app.env', 'production');
        config()->set('bidding_service.client_assertion_enabled', false);
        $this->expectException(RuntimeException::class);
        app(ClientAssertionProductionPolicy::class)->enforce();
    }

    public function test_non_production_allows_disabled_issuance_without_key_configuration(): void
    {
        config()->set('app.env', 'testing');
        config()->set('bidding_service.client_assertion_enabled', false);
        app(ClientAssertionProductionPolicy::class)->enforce();

        $this->assertTrue(true);
    }

    public function test_production_enabled_issuance_validates_required_configuration(): void
    {
        config()->set('app.env', 'production');
        config()->set('bidding_service.client_assertion_enabled', true);
        config()->set('tenant.id', config('tenant.fallback_id'));

        app(ClientAssertionProductionPolicy::class)->enforce();

        $this->assertTrue(true);
    }

    /** @return array{0: array<string, mixed>, 1: array<string, mixed>, 2: string} */
    private function decode(string $token): array
    {
        $parts = explode('.', $token);

        return [
            json_decode(base64_decode(strtr($parts[0], '-_', '+/')), true, 512, JSON_THROW_ON_ERROR),
            json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true, 512, JSON_THROW_ON_ERROR),
            base64_decode(strtr($parts[2], '-_', '+/')),
        ];
    }

    private function signingInput(string $token): string
    {
        return substr($token, 0, strrpos($token, '.'));
    }

    private function publicKey(): string
    {
        $privateKey = openssl_pkey_get_private((string) file_get_contents($this->privateKeyPath));
        $details = openssl_pkey_get_details($privateKey);

        return $details['key'];
    }

    private function generateKey(string $path, int $bits): void
    {
        $directory = dirname($path);
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }

        $process = proc_open(
            'openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:'.$bits.' -out '.escapeshellarg($path),
            [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
        );
        $exitCode = is_resource($process) ? proc_close($process) : 1;
        $this->assertSame(0, $exitCode);
    }
}
