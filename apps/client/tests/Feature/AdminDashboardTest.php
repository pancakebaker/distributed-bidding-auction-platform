<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Models\AuditLog;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_guest_cannot_access_admin_dashboard(): void
    {
        $this->get('/admin')->assertRedirect('/login');
    }

    public function test_authenticated_non_admin_cannot_access_admin_dashboard(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin')->assertForbidden();
    }

    public function test_admin_can_access_admin_dashboard(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->get('/admin')->assertOk();
    }

    public function test_admin_dashboard_contains_only_safe_application_data(): void
    {
        config([
            'services.phase13.secret' => 'phase13-sensitive-test-key',
            'database.connections.sqlite.database' => 'phase13-sensitive-database-path',
            'queue.connections.database.connection' => 'phase13-sensitive-queue-connection',
        ]);

        $admin = User::factory()->admin()->create();
        User::factory()->create();
        Page::factory()->published()->create(['created_by' => $admin->id, 'updated_by' => $admin->id]);
        Page::factory()->create(['status' => PageStatus::Draft, 'created_by' => $admin->id, 'updated_by' => $admin->id]);
        Faq::factory()->published()->create(['created_by' => $admin->id, 'updated_by' => $admin->id]);
        AuditLog::factory()->create(['action' => 'page.updated', 'user_id' => $admin->id]);

        $response = $this->actingAs($admin)->get('/admin');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('dashboard', $bootstrap['page']);
        $this->assertSame([
            ['label' => 'Total users', 'value' => 2],
            ['label' => 'Administrators', 'value' => 1],
            ['label' => 'Total pages', 'value' => 2],
            ['label' => 'Published pages', 'value' => 1],
            ['label' => 'Draft pages', 'value' => 1],
            ['label' => 'Published FAQs', 'value' => 1],
            ['label' => 'Audit events today', 'value' => 1],
            ['label' => 'Environment', 'value' => 'testing'],
            ['label' => 'Database', 'value' => 'sqlite'],
            ['label' => 'Cache', 'value' => 'array'],
            ['label' => 'Queue', 'value' => 'sync'],
        ], $bootstrap['props']['metrics']);
        $this->assertSame('Page Updated', $bootstrap['props']['auditActionCounts'][0]['label']);
        $this->assertSame('page.updated', $bootstrap['props']['recentAuditLogs'][0]['action']);

        $response->assertDontSee('phase13-sensitive-test-key');
        $response->assertDontSee('phase13-sensitive-database-path');
        $response->assertDontSee('phase13-sensitive-queue-connection');
    }
}
