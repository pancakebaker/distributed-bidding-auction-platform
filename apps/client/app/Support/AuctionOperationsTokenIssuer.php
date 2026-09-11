<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Str;
use RuntimeException;

class AuctionOperationsTokenIssuer
{
    /** @return array{token: string, expiresAt: string} */
    public function issue(User $user): array
    {
        $privateKey = @file_get_contents(
            (string) config('auction_operations.token_private_key_path'),
        );
        if ($privateKey === false || $privateKey === '') {
            throw new RuntimeException('Auction Operations signing key is not configured.');
        }

        $issuedAt = time();
        $expiresAt = $issuedAt + max(
            60,
            min((int) config('auction_operations.token_ttl_seconds', 300), 600),
        );
        $claims = [
            'sub' => (string) $user->getAuthIdentifier(),
            'email' => (string) $user->email,
            'role' => 'admin',
            'permissions' => [(string) config('auction_operations.token_permission')],
            'iss' => (string) config('auction_operations.token_issuer'),
            'aud' => (string) config('auction_operations.token_audience'),
            'iat' => $issuedAt,
            'exp' => $expiresAt,
            'jti' => (string) Str::uuid(),
        ];

        $header = $this->encode(['alg' => 'RS256', 'typ' => 'JWT']);
        $payload = $this->encode($claims);
        $input = $header.'.'.$payload;
        $signature = '';
        if (! openssl_sign($input, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Auction Operations token signing failed.');
        }

        return [
            'token' => $input.'.'.$this->base64UrlEncode($signature),
            'expiresAt' => gmdate(DATE_ATOM, $expiresAt),
        ];
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
