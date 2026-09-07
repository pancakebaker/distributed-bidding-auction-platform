<?php

namespace Tests\Feature;

use App\Contracts\AuditLogExporter;
use App\Enums\ExportStatus;
use App\Jobs\GenerateAuditLogExport;
use App\Models\AuditLog;
use App\Models\Export;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class AuditLogExportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Storage::fake('local');
    }

    public function test_non_admin_cannot_access_exports(): void
    {
        $this->get('/admin/exports')->assertRedirect('/login');

        $this->actingAs(User::factory()->create())
            ->get('/admin/exports')
            ->assertForbidden();
    }

    public function test_admin_can_request_audit_log_export_and_job_is_dispatched(): void
    {
        Queue::fake();
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/admin/audit-logs/export')->assertRedirect('/admin/exports');

        $export = Export::query()->firstOrFail();
        $this->assertSame($admin->id, $export->user_id);
        $this->assertSame(ExportStatus::Pending, $export->status);
        $this->assertDatabaseHas('audit_logs', ['action' => 'export.requested', 'auditable_id' => $export->id]);
        Queue::assertPushed(GenerateAuditLogExport::class, fn (GenerateAuditLogExport $job): bool => $job->exportId === $export->id);
    }

    public function test_export_job_generates_safe_csv_and_marks_export_completed(): void
    {
        $admin = User::factory()->admin()->create(['name' => '=Admin']);
        AuditLog::factory()->create([
            'user_id' => $admin->id,
            'action' => 'page.updated',
            'auditable_type' => Page::class,
            'auditable_id' => 42,
            'metadata' => ['title' => '=Formula Title', 'body' => 'secret body'],
        ]);
        $export = Export::factory()->create(['user_id' => $admin->id]);

        app(GenerateAuditLogExport::class, ['exportId' => $export->id])->handle(app(AuditLogExporter::class));

        $export->refresh();
        $this->assertSame(ExportStatus::Completed, $export->status);
        $this->assertNotNull($export->completed_at);
        Storage::disk('local')->assertExists($export->file_path);
        $csv = Storage::disk('local')->get($export->file_path);
        $this->assertStringContainsString("'=Admin", $csv);
        $this->assertStringContainsString("'=Formula Title", $csv);
        $this->assertStringNotContainsString('secret body', $csv);
    }

    public function test_export_download_is_owner_only_and_uses_stored_path(): void
    {
        $owner = User::factory()->admin()->create();
        $otherAdmin = User::factory()->admin()->create();
        $export = Export::factory()->create([
            'user_id' => $owner->id,
            'status' => ExportStatus::Completed,
            'file_path' => 'exports/audit-logs/1.csv',
            'completed_at' => now(),
        ]);
        Storage::disk('local')->put('exports/audit-logs/1.csv', 'timestamp,actor');

        $this->actingAs($otherAdmin)->get(route('admin.exports.download', $export))->assertForbidden();
        $this->actingAs($owner)->get(route('admin.exports.download', $export))->assertOk();
    }

    public function test_export_job_failure_marks_export_failed(): void
    {
        $export = Export::factory()->create(['status' => ExportStatus::Pending]);
        $this->app->instance(AuditLogExporter::class, new class implements AuditLogExporter
        {
            public function export(Export $export): string
            {
                throw new RuntimeException('Exporter failed permanently.');
            }
        });

        $this->expectException(RuntimeException::class);

        try {
            app(GenerateAuditLogExport::class, ['exportId' => $export->id])->handle(app(AuditLogExporter::class));
        } finally {
            $export->refresh();
            $this->assertSame(ExportStatus::Failed, $export->status);
            $this->assertStringContainsString('Exporter failed', $export->error_message);
        }
    }

    public function test_export_job_retry_settings_are_reasonable(): void
    {
        $job = new GenerateAuditLogExport(123);

        $this->assertSame(3, $job->tries);
        $this->assertSame([60, 300, 900], $job->backoff);
    }
}
