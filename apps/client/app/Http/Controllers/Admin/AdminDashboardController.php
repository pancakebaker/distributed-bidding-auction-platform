<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminBootstrapData;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminDashboardController extends Controller
{
    /**
     * Render the initial Laravel-owned administration dashboard.
     */
    public function __invoke(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::dashboard());
    }
}
