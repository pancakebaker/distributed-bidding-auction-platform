<?php

namespace App\Support;

use Illuminate\Support\Str;
use RuntimeException;

/**
 * Issues short-lived RS256 assertions proving this Laravel installation's
 * registered Bidding Service application identity.
 */
final class ClientAssertionIssuer
{
    public function validateConfiguration(): void
    {
        $this->validatedConfiguration();
    }

    /** @return array{token: string, expiresAt: string, jti: string} */
    public function issue(): array
    {
        $configuration = $this->validatedConfiguration();
        $clientId = $configuration['clientId'];
        $keyId = $configuration['keyId'];
        $tenantId = app(TenantContext::class)->id();
        $privateKey = $configuration['privateKey'];
        $ttl = $configuration['ttl'];
        $issuedAt = time();
        $expiresAt = $issuedAt + $ttl;
        $jti = (string) Str::uuid();
        $claims = [
            'iss' => $clientId,
            'aud' => 'dbap-bidding-service',
            'tenant_id' => $tenantId,
            'jti' => $jti,
            'iat' => $issuedAt,
            'nbf' => $issuedAt,
            'exp' => $expiresAt,
        ];
        $header = $this->encode([
            'alg' => 'RS256',
            'typ' => 'JWT',
            'kid' => $keyId,
        ]);
        $payload = $this->encode($claims);
        $input = $header.'.'.$payload;
        $signature = '';
        if (! openssl_sign($input, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Bidding Service client assertion signing failed.');
        }

        return [
            'token' => $input.'.'.$this->base64UrlEncode($signature),
            'expiresAt' => gmdate(DATE_ATOM, $expiresAt),
            'jti' => $jti,
        ];
    }

    /** @return array{clientId: string, keyId: string, privateKey: \OpenSSLAsymmetricKey, ttl: int} */
    private function validatedConfiguration(): array
    {
        $clientId = trim((string) config('bidding_service.client_assertion_client_id'));
        $keyId = trim((string) config('bidding_service.client_assertion_key_id'));
        $path = trim((string) config('bidding_service.client_assertion_private_key_path'));
        $ttl = (int) config('bidding_service.client_assertion_ttl_seconds', 30);

        $this->validateClientId($clientId);
        $this->validateKeyId($keyId);
        if ($path === '' || ! is_file($path) || ! is_readable($path)) {
            throw new RuntimeException('Bidding Service client assertion private key is not readable.');
        }

        if ($ttl < 1 || $ttl > 60) {
            throw new RuntimeException('Bidding Service client assertion TTL must be between 1 and 60 seconds.');
        }

        $privateKeyPem = @file_get_contents($path);
        if ($privateKeyPem === false || $privateKeyPem === '') {
            throw new RuntimeException('Bidding Service client assertion private key is unavailable.');
        }

        $privateKey = openssl_pkey_get_private($privateKeyPem);
        if ($privateKey === false) {
            throw new RuntimeException('Bidding Service client assertion private key is invalid.');
        }

        $details = openssl_pkey_get_details($privateKey);
        if (! is_array($details)
            || ($details['type'] ?? null) !== OPENSSL_KEYTYPE_RSA
            || (int) ($details['bits'] ?? 0) < 2048) {
            throw new RuntimeException('Bidding Service client assertion key must be an RSA key of at least 2048 bits.');
        }

        return compact('clientId', 'keyId', 'privateKey', 'ttl');
    }

    private function validateClientId(string $clientId): void
    {
        if (! preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/', $clientId)) {
            throw new RuntimeException('Bidding Service client assertion ClientId is invalid.');
        }
    }

    private function validateKeyId(string $keyId): void
    {
        if (! preg_match('/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/', $keyId)) {
            throw new RuntimeException('Bidding Service client assertion KeyId is invalid.');
        }
    }

    /** @param array<string, mixed> $value */
    private function encode(array $value): string
    {
        return $this->base64UrlEncode((string) json_encode($value, JSON_THROW_ON_ERROR));
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
