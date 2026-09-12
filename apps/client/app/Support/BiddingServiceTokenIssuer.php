<?php

namespace App\Support;

use App\Auth\ApplicationAuth;
use App\Models\User;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Issues short-lived trusted identity tokens for the Bidding Service.
 */
class BiddingServiceTokenIssuer
{
    /** @return array{token: string, expiresAt: string} */
    public function issue(User $user): array
    {
        $issuer = trim((string) config('bidding_service.token_issuer'));
        $audience = trim((string) config('bidding_service.token_audience'));
        $keyId = trim((string) config('bidding_service.token_key_id'));
        if ($issuer === '' || $audience === '' || $keyId === '') {
            throw new RuntimeException('Bidding Service token identity configuration is incomplete.');
        }

        $privateKey = @file_get_contents((string) config('bidding_service.token_private_key_path'));
        if ($privateKey === false || $privateKey === '') {
            throw new RuntimeException('Bidding Service signing key is not configured.');
        }

        $issuedAt = time();
        $expiresAt = $issuedAt + max(
            60,
            min((int) config('bidding_service.token_ttl_seconds', 300), 600),
        );
        $permissions = [
            ApplicationAuth::PERMISSION_AUCTION_BID,
            ApplicationAuth::PERMISSION_AUCTION_BUY,
        ];
        if ($user->is_admin) {
            $permissions[] = ApplicationAuth::PERMISSION_AUCTION_MANAGE;
        }

        $claims = [
            'iss' => $issuer,
            'aud' => $audience,
            'sub' => $user->getSubjectId(),
            'name' => (string) $user->name,
            'iat' => $issuedAt,
            'exp' => $expiresAt,
            'jti' => (string) Str::uuid(),
            ApplicationAuth::CLAIM_ROLE => $user->is_admin ? ApplicationAuth::ROLE_ADMIN : 'bidder',
            ApplicationAuth::CLAIM_PERMISSIONS => $permissions,
        ];

        $header = $this->encode(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => $keyId]);
        $payload = $this->encode($claims);
        $input = $header.'.'.$payload;
        $signature = '';
        if (! openssl_sign($input, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Bidding Service token signing failed.');
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
