<?php

namespace App\Http\Controllers\Admin;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Events\ExportRequested;
use App\Http\Controllers\Controller;
use App\Jobs\GenerateAuditLogExport;
use App\Models\Export;
use App\Support\AdminBootstrapData;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AdminExportController extends Controller
{
    /**
     * Render export request status.
     */
    public function index(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::exports($request));
    }

    /**
     * Request an asynchronous audit-log export.
     */
    public function store(Request $request): RedirectResponse
    {
        $export = Export::query()->create([
            'user_id' => $request->user()->id,
            'type' => ExportType::AuditLogs,
            'status' => ExportStatus::Pending,
        ]);

        ExportRequested::dispatch($export);
        GenerateAuditLogExport::dispatch($export->id);

        return redirect()
            ->route('admin.exports.index')
            ->with('status', 'Audit log export queued.');
    }

    /**
     * Download a completed export owned by the current admin.
     */
    public function download(Request $request, Export $export): StreamedResponse
    {
        abort_unless($export->user_id === $request->user()->id, 403);
        abort_unless($export->status === ExportStatus::Completed && $export->file_path !== null, 404);
        abort_unless(Storage::disk('local')->exists($export->file_path), 404);

        return Storage::disk('local')->download($export->file_path, "audit-log-export-{$export->id}.csv");
    }
}
