<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminAuctionController extends Controller
{
    /**
     * Render the Bidding Service-backed auction management surface.
     */
    public function __invoke(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, [
            'page' => 'auctions',
            'navigation' => \App\Support\AdminNavigation::for('auctions'),
            'props' => [],
        ]);
    }
}
