<?php

namespace App\Http\Controllers;

use App\Support\BiddingServiceClient;
use Illuminate\Http\Request;

class PublicAuctionController extends Controller
{
    public function index(Request $request, BiddingServiceClient $client)
    {
        return $client->getPublicRead('', $request->header('X-Correlation-ID'));
    }

    public function show(Request $request, string $auction, BiddingServiceClient $client)
    {
        return $client->getPublicRead($auction, $request->header('X-Correlation-ID'));
    }

    public function bids(Request $request, string $auction, BiddingServiceClient $client)
    {
        return $client->getPublicRead($auction.'/bids', $request->header('X-Correlation-ID'));
    }
}
