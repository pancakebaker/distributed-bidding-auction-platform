<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;
use RuntimeException;

class LiveFeedAdminTokenIssuer
{
    /**
     * Issue a short-lived RS256 token for the authenticated Laravel admin.
     *
     * @return array{token: string, expiresAt: string}
     */
    public function issue(User $user): array
    {
        $privateKeyPath = (string) config('live_feed.token_private_key_path');
        $privateKey = @file_get_contents($privateKeyPath);

        if ($privateKey === false || $privateKey === '') {
            throw new RuntimeException('Live-feed admin signing key is not configured.');
        }

        $issuedAt = time();
        $expiresAt = $issuedAt + max(
            60,
            min((int) config('live_feed.token_ttl_seconds', 600), 900),
        );
        $claims = [
            'sub' => (string) $user->getAuthIdentifier(),
            'email' => (string) $user->email,
            'role' => 'admin',
            'permissions' => ['access-live-feed-admin'],
            'iss' => (string) config('live_feed.token_issuer', 'auction-client'),
            'aud' => (string) config('live_feed.token_audience', 'live-feed-admin'),
            'iat' => $issuedAt,
            'exp' => $expiresAt,
            'jti' => (string) Str::uuid(),
        ];

        $encodedHeader = $this->encode(['alg' => 'RS256', 'typ' => 'JWT']);
        $encodedClaims = $this->encode($claims);
        $signingInput = $encodedHeader.'.'.$encodedClaims;
        $signature = '';

        if (! openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Live-feed admin token signing failed.');
        }

        return [
            'token' => $signingInput.'.'.$this->base64UrlEncode($signature),
            'expiresAt' => gmdate(DATE_ATOM, $expiresAt),
        ];
    }

    /**
     * Encode a JWT JSON segment without exposing signing material.
     *
     * @param  array<string, mixed>  $value
     */
    private function encode(array $value): string
    {
        return $this->base64UrlEncode((string) json_encode($value, JSON_THROW_ON_ERROR));
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
