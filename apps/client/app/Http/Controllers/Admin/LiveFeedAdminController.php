<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\LiveFeedAdminTokenIssuer;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LiveFeedAdminController extends Controller
{
    public function __construct(private readonly LiveFeedAdminTokenIssuer $tokenIssuer) {}

    /**
     * Render a short-lived form handoff to the Node token-exchange endpoint.
     */
    public function __invoke(Request $request): View
    {
        return view('admin.live-feed-redirect', [
            'serviceUrl' => (string) config('live_feed.service_url'),
            'token' => $this->tokenIssuer->issue($request->user()),
        ]);
    }

    /**
     * Issue a short-lived admin token to an authenticated Laravel admin client.
     */
    public function token(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json($this->tokenIssuer->issue($user));
    }
}
