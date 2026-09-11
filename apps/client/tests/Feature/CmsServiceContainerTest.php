<?php

namespace Tests\Feature;

use App\Contracts\AuditLogExporter;
use App\Contracts\CmsCache;
use App\Models\Page;
use App\Services\CsvAuditLogExporter;
use App\Services\LaravelCmsCache;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CmsServiceContainerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_cms_cache_interface_resolves_to_laravel_implementation(): void
    {
        $this->assertInstanceOf(LaravelCmsCache::class, $this->app->make(CmsCache::class));
    }

    public function test_audit_log_exporter_interface_resolves_to_csv_implementation(): void
    {
        $this->assertInstanceOf(CsvAuditLogExporter::class, $this->app->make(AuditLogExporter::class));
    }

    public function test_public_page_controller_can_use_injected_fake_cache(): void
    {
        Page::factory()->published()->create(['slug' => 'fake-cache-page']);

        $this->app->instance(CmsCache::class, new class implements CmsCache
        {
            public function getPublicNavigationPages(): array
            {
                return [];
            }

            public function forgetPublicNavigationPages(): void {}

            public function getPage(string $slug): ?array
            {
                return [
                    'title' => "Fake {$slug}",
                    'body' => 'Served from a fake cache implementation.',
                    'published_at' => null,
                ];
            }

            public function forgetPage(string $slug): void {}

            public function getFaqs(): array
            {
                return [];
            }

            public function forgetFaqs(): void {}
        });

        $response = $this->get('/pages/fake-cache-page');
        $response->assertOk();
        $this->assertSame('Fake fake-cache-page', $response->viewData('cmsBootstrap')['props']['title']);
    }
}
