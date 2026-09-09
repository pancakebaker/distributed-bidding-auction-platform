<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AuctionOperationsTokenIssuer;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Request;

class AuctionOperationsController extends Controller
{
    public function __construct(private readonly AuctionOperationsTokenIssuer $tokenIssuer) {}

    public function __invoke(Request $request): View
    {
        $handoff = $this->tokenIssuer->issue($request->user());

        return view('admin.auction-operations-redirect', [
            'handoffUrl' => (string) config('auction_operations.handoff_url'),
            'token' => $handoff['token'],
        ]);
    }
}
