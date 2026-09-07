<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Support\AdminBootstrapData;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminAuditLogController extends Controller
{
    /**
     * Render the read-only audit log.
     */
    public function index(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::auditLogs());
    }
}
