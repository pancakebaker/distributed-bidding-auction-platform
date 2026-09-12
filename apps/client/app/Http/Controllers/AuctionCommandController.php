<?php

namespace App\Http\Controllers;

use App\Support\BiddingServiceClient;
use Illuminate\Http\Request;

class AuctionCommandController extends Controller
{
    public function placeBid(
        Request $request,
        string $auction,
        BiddingServiceClient $client,
    ) {
        return $client->postCommand(
            $request->user(),
            $auction.'/bids',
            $request->only(['amount']),
            $request->header('X-Correlation-ID'),
        );
    }

    public function buyNow(
        Request $request,
        string $auction,
        BiddingServiceClient $client,
    ) {
        return $client->postCommand(
            $request->user(),
            $auction.'/buy-now',
            [],
            $request->header('X-Correlation-ID'),
        );
    }
}
