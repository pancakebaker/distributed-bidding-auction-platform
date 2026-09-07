<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminAuditLogTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_cms_writes_generate_safe_audit_records(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/admin/pages', [
            'title' => 'Terms',
            'slug' => 'terms',
            'body' => 'Sensitive body should not be copied into audit metadata.',
            'status' => 'draft',
        ])->assertRedirect();

        $page = Page::query()->where('slug', 'terms')->firstOrFail();
        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'Terms Updated',
            'slug' => 'terms',
            'body' => 'Updated sensitive body should not be copied.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $this->actingAs($admin)->post('/admin/faqs', [
            'question' => 'Can I cancel?',
            'answer' => 'Sensitive answer should not be copied into audit metadata.',
            'sort_order' => 1,
            'is_published' => true,
        ])->assertRedirect();

        $faq = Faq::query()->where('question', 'Can I cancel?')->firstOrFail();
        $this->actingAs($admin)->put(route('admin.faqs.update', $faq), [
            'question' => 'Can I cancel now?',
            'answer' => 'Updated sensitive answer should not be copied.',
            'sort_order' => 2,
            'is_published' => false,
        ])->assertRedirect();

        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'page.created']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'page.updated']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'faq.created']);
        $this->assertDatabaseHas('audit_logs', ['user_id' => $admin->id, 'action' => 'faq.updated']);

        $encodedMetadata = AuditLog::query()->pluck('metadata')->map(fn (?array $metadata): string => json_encode($metadata))->implode(' ');
        $this->assertStringNotContainsString('Sensitive body', $encodedMetadata);
        $this->assertStringNotContainsString('Sensitive answer', $encodedMetadata);
        $this->assertStringNotContainsString('password', $encodedMetadata);
        $this->assertStringNotContainsString('token', $encodedMetadata);
    }

    public function test_audit_page_requires_admin_authorization(): void
    {
        $this->get('/admin/audit-logs')->assertRedirect('/login');

        $this->actingAs(User::factory()->create())
            ->get('/admin/audit-logs')
            ->assertForbidden();

        $this->actingAs(User::factory()->admin()->create())
            ->get('/admin/audit-logs')
            ->assertOk();
    }

    public function test_audit_page_paginates_and_hides_raw_metadata(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Ada Admin']);
        AuditLog::factory()
            ->count(26)
            ->create([
                'user_id' => $admin->id,
                'action' => 'page.updated',
                'auditable_type' => Page::class,
                'metadata' => ['title' => 'Visible summary', 'secret' => 'hidden-secret'],
            ]);

        $response = $this->actingAs($admin)->get('/admin/audit-logs');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('audit-logs', $bootstrap['page']);
        $this->assertCount(25, $bootstrap['props']['logs']);
        $this->assertSame(2, $bootstrap['props']['pagination']['last_page']);
        $this->assertSame('Ada Admin', $bootstrap['props']['logs'][0]['actor_name']);
        $this->assertSame('Visible summary', $bootstrap['props']['logs'][0]['summary']);
        $this->assertArrayNotHasKey('metadata', $bootstrap['props']['logs'][0]);
        $response->assertDontSee('hidden-secret');
    }
}
