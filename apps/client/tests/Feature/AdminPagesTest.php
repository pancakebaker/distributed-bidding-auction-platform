<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminPagesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_guest_cannot_access_admin_pages(): void
    {
        $this->get('/admin/pages')->assertRedirect('/login');
    }

    public function test_authenticated_non_admin_cannot_access_admin_pages(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin/pages')->assertForbidden();
    }

    public function test_admin_can_list_pages_with_creator_and_updater_names(): void
    {
        $admin = User::factory()->admin()->create(['name' => 'Ada Admin']);
        $updater = User::factory()->admin()->create(['name' => 'Uma Updater']);
        Page::factory()->published()->create([
            'title' => 'About us',
            'slug' => 'about-us',
            'created_by' => $admin->id,
            'updated_by' => $updater->id,
        ]);

        $response = $this->actingAs($admin)->get('/admin/pages');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('pages', $bootstrap['page']);
        $this->assertSame('index', $bootstrap['props']['mode']);
        $this->assertSame('Ada Admin', $bootstrap['props']['pages'][0]['creator_name']);
        $this->assertSame('Uma Updater', $bootstrap['props']['pages'][0]['updater_name']);
        $this->assertArrayNotHasKey('password', $bootstrap['props']['pages'][0]);
        $response->assertDontSee('remember_token');
    }

    public function test_admin_can_open_page_create_form(): void
    {
        $admin = User::factory()->admin()->create();

        $response = $this->actingAs($admin)->get('/admin/pages/create');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('create', $bootstrap['props']['mode']);
        $this->assertSame(['draft', 'published'], $bootstrap['props']['statusOptions']);
    }

    public function test_valid_page_can_be_created_with_server_derived_creator_and_updater(): void
    {
        $admin = User::factory()->admin()->create();
        $otherUser = User::factory()->create();

        $response = $this->actingAs($admin)->post('/admin/pages', [
            'title' => 'How it works',
            'slug' => 'how-it-works',
            'body' => 'Plain text explanation.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
            'created_by' => $otherUser->id,
            'updated_by' => $otherUser->id,
        ]);

        $page = Page::query()->where('slug', 'how-it-works')->firstOrFail();
        $response->assertRedirect(route('admin.pages.edit', $page));
        $this->assertSame($admin->id, $page->created_by);
        $this->assertSame($admin->id, $page->updated_by);
    }

    public function test_invalid_page_is_rejected(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)
            ->from('/admin/pages/create')
            ->post('/admin/pages', [
                'title' => '',
                'slug' => 'not allowed spaces',
                'body' => '',
                'status' => 'archived',
            ])
            ->assertRedirect('/admin/pages/create')
            ->assertSessionHasErrors(['title', 'slug', 'body', 'status']);
    }

    public function test_duplicate_page_slug_is_rejected(): void
    {
        $admin = User::factory()->admin()->create();
        Page::factory()->create(['slug' => 'privacy']);

        $this->actingAs($admin)
            ->from('/admin/pages/create')
            ->post('/admin/pages', [
                'title' => 'Privacy',
                'slug' => 'privacy',
                'body' => 'Policy text.',
                'status' => 'draft',
            ])
            ->assertRedirect('/admin/pages/create')
            ->assertSessionHasErrors(['slug']);
    }

    public function test_admin_can_update_page_and_updater_is_server_derived(): void
    {
        $creator = User::factory()->admin()->create();
        $admin = User::factory()->admin()->create();
        $otherUser = User::factory()->create();
        $page = Page::factory()->create([
            'slug' => 'terms',
            'created_by' => $creator->id,
            'updated_by' => $creator->id,
        ]);

        $response = $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'Updated Terms',
            'slug' => 'terms',
            'body' => 'Updated policy text.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
            'updated_by' => $otherUser->id,
        ]);

        $response->assertRedirect(route('admin.pages.edit', $page->fresh()));
        $page->refresh();
        $this->assertSame('Updated Terms', $page->title);
        $this->assertSame($creator->id, $page->created_by);
        $this->assertSame($admin->id, $page->updated_by);
    }

    public function test_public_route_shows_published_page_as_plain_text(): void
    {
        $page = Page::factory()->published()->create([
            'slug' => 'about',
            'title' => 'About',
            'body' => '<strong>Plain text only</strong>',
        ]);

        $response = $this->get('/pages/about');
        $response->assertOk();
        $response->assertViewHas('cmsBootstrap.props.title', $page->title);
        $this->assertSame('<strong>Plain text only</strong>', $response->viewData('cmsBootstrap')['props']['body']);
        $response->assertDontSee('<strong>Plain text only</strong>', false);
    }

    public function test_public_route_hides_draft_page(): void
    {
        Page::factory()->create(['slug' => 'draft-page', 'status' => PageStatus::Draft]);

        $this->get('/pages/draft-page')->assertNotFound();
    }

    public function test_future_dated_published_page_is_not_public_yet(): void
    {
        Page::factory()->create([
            'slug' => 'future-page',
            'status' => PageStatus::Published,
            'published_at' => now()->addDay(),
        ]);

        $this->get('/pages/future-page')->assertNotFound();
    }
}
