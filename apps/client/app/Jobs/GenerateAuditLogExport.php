<?php

namespace App\Jobs;

use App\Contracts\AuditLogExporter;
use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Models\Export;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Throwable;

class GenerateAuditLogExport implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public int $tries = 3;

    /** @var array<int, int> */
    public array $backoff = [60, 300, 900];

    /**
     * Create the export job using only the export identifier.
     */
    public function __construct(public readonly int $exportId) {}

    /**
     * Generate the CSV export.
     */
    public function handle(AuditLogExporter $exporter): void
    {
        $export = Export::query()->findOrFail($this->exportId);

        if ($export->status === ExportStatus::Completed) {
            return;
        }

        if ($export->type !== ExportType::AuditLogs) {
            $export->forceFill([
                'status' => ExportStatus::Failed,
                'error_message' => 'Unsupported export type.',
                'completed_at' => now(),
            ])->save();

            return;
        }

        $export->forceFill([
            'status' => ExportStatus::Processing,
            'error_message' => null,
        ])->save();

        try {
            $path = $exporter->export($export);

            $export->forceFill([
                'status' => ExportStatus::Completed,
                'file_path' => $path,
                'error_message' => null,
                'completed_at' => now(),
            ])->save();
        } catch (Throwable $throwable) {
            $export->forceFill([
                'status' => ExportStatus::Failed,
                'error_message' => str($throwable->getMessage())->limit(500)->toString(),
                'completed_at' => now(),
            ])->save();

            throw $throwable;
        }
    }

    /**
     * Mark the application export failed when Laravel exhausts retries.
     */
    public function failed(Throwable $throwable): void
    {
        Export::query()
            ->whereKey($this->exportId)
            ->where('status', '!=', ExportStatus::Completed->value)
            ->update([
                'status' => ExportStatus::Failed->value,
                'error_message' => str($throwable->getMessage())->limit(500)->toString(),
                'completed_at' => now(),
            ]);
    }
}
