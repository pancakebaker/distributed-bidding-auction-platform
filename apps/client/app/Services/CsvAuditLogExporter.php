<?php

namespace App\Services;

use App\Contracts\AuditLogExporter;
use App\Models\AuditLog;
use App\Models\Export;
use Illuminate\Support\Facades\Storage;

class CsvAuditLogExporter implements AuditLogExporter
{
    /**
     * Generate a memory-conscious CSV export using Laravel storage.
     */
    public function export(Export $export): string
    {
        $path = "exports/audit-logs/{$export->id}.csv";
        $stream = fopen('php://temp', 'w+');

        fputcsv($stream, ['timestamp', 'actor', 'action', 'resource_type', 'resource_id', 'summary']);

        AuditLog::query()
            ->with('user:id,name')
            ->orderBy('id')
            ->lazyById(100)
            ->each(function (AuditLog $log) use ($stream): void {
                fputcsv($stream, [
                    $this->safeCsvValue($log->created_at?->toIso8601String() ?? ''),
                    $this->safeCsvValue($log->user?->name ?? 'System'),
                    $this->safeCsvValue($log->action),
                    $this->safeCsvValue($this->resourceLabel($log->auditable_type)),
                    $this->safeCsvValue((string) ($log->auditable_id ?? '')),
                    $this->safeCsvValue($this->summary($log)),
                ]);
            });

        rewind($stream);
        Storage::disk('local')->put($path, stream_get_contents($stream));
        fclose($stream);

        return $path;
    }

    /**
     * Prevent spreadsheet formula execution for user-controlled values.
     */
    private function safeCsvValue(string $value): string
    {
        if ($value !== '' && in_array($value[0], ['=', '+', '-', '@'], true)) {
            return "'{$value}";
        }

        return $value;
    }

    /**
     * Build a readable resource label.
     */
    private function resourceLabel(?string $type): string
    {
        return match ($type) {
            'App\Models\Page' => 'Page',
            'App\Models\Faq' => 'FAQ',
            default => $type ?? 'Unknown',
        };
    }

    /**
     * Build a safe metadata summary for export rows.
     */
    private function summary(AuditLog $log): string
    {
        $metadata = $log->metadata ?? [];

        if (isset($metadata['title'])) {
            return (string) $metadata['title'];
        }

        if (isset($metadata['question'])) {
            return (string) $metadata['question'];
        }

        return 'No summary';
    }
}
