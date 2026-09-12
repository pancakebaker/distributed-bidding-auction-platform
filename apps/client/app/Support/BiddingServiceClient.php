<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Proxies authenticated auction commands to the authoritative Bidding Service.
 */
class BiddingServiceClient
{
    public function __construct(private readonly BiddingServiceTokenIssuer $tokenIssuer) {}

    /** @param array<string, mixed> $payload */
    public function postCommand(
        User $user,
        string $path,
        array $payload,
        ?string $correlationId,
    ): Response {
        try {
            $token = $this->tokenIssuer->issue($user)['token'];
            $request = Http::acceptJson()
                ->timeout((int) config('bidding_service.timeout_seconds', 10))
                ->withToken($token);

            if ($correlationId !== null && trim($correlationId) !== '') {
                $request = $request->withHeaders(['X-Correlation-ID' => $correlationId]);
            }

            $upstream = $request->post(
                rtrim((string) config('bidding_service.url'), '/').'/api/auctions/'.$path,
                $payload,
            );

            return response($upstream->body(), $upstream->status())
                ->header('Content-Type', $upstream->header('Content-Type', 'application/json'))
                ->header(
                    'X-Correlation-ID',
                    $upstream->header('X-Correlation-ID', $correlationId ?? ''),
                );
        } catch (Throwable) {
            return response()->json([
                'code' => 'bidding_service_unavailable',
                'message' => 'The bidding service is temporarily unavailable.',
            ], 503);
        }
    }
}
