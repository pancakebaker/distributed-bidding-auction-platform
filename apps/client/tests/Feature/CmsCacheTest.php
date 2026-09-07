<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class CmsCacheTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_published_page_is_cached_after_first_public_read_and_reused(): void
    {
        $page = Page::factory()->published()->create([
            'slug' => 'cached-page',
            'title' => 'Cached Page',
        ]);

        $this->get('/pages/cached-page')->assertOk();
        $this->assertTrue(Cache::has('cms:page:cached-page'));

        $page->forceFill(['title' => 'Database Changed Without Invalidation'])->save();

        $response = $this->get('/pages/cached-page');
        $response->assertOk();
        $this->assertSame('Cached Page', $response->viewData('cmsBootstrap')['props']['title']);
    }

    public function test_page_update_invalidates_current_page_cache(): void
    {
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->published()->create(['slug' => 'refresh-me']);

        $this->get('/pages/refresh-me')->assertOk();
        $this->assertTrue(Cache::has('cms:page:refresh-me'));

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'Updated Cache Page',
            'slug' => 'refresh-me',
            'body' => 'Updated body.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $this->assertFalse(Cache::has('cms:page:refresh-me'));
    }

    public function test_page_slug_change_invalidates_old_and_new_page_cache_keys(): void
    {
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->published()->create(['slug' => 'old-page']);

        Cache::put('cms:page:old-page', ['title' => 'Old', 'body' => 'Old', 'published_at' => null]);
        Cache::put('cms:page:new-page', ['title' => 'New', 'body' => 'New', 'published_at' => null]);

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'New Page',
            'slug' => 'new-page',
            'body' => 'New body.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $this->assertFalse(Cache::has('cms:page:old-page'));
        $this->assertFalse(Cache::has('cms:page:new-page'));
    }

    public function test_faq_update_invalidates_public_faq_cache(): void
    {
        $admin = User::factory()->admin()->create();
        $faq = Faq::factory()->published()->create(['question' => 'Cached FAQ?']);

        $this->get('/faq')->assertOk();
        $this->assertTrue(Cache::has('cms:faqs'));

        $this->actingAs($admin)->put(route('admin.faqs.update', $faq), [
            'question' => 'Updated cached FAQ?',
            'answer' => 'Updated.',
            'sort_order' => 1,
            'is_published' => true,
        ])->assertRedirect();

        $this->assertFalse(Cache::has('cms:faqs'));
    }

    public function test_draft_page_is_not_served_from_stale_cache_after_admin_update(): void
    {
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->published()->create(['slug' => 'draftable']);

        $this->get('/pages/draftable')->assertOk();
        $this->assertTrue(Cache::has('cms:page:draftable'));

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'Drafted',
            'slug' => 'draftable',
            'body' => 'Hidden.',
            'status' => 'draft',
            'published_at' => null,
        ])->assertRedirect();

        $this->get('/pages/draftable')->assertNotFound();
    }

    public function test_draft_page_is_not_served_from_manually_stale_cache(): void
    {
        Page::factory()->create([
            'slug' => 'stale-draft',
            'status' => PageStatus::Draft,
        ]);
        Cache::put('cms:page:stale-draft', ['title' => 'Stale', 'body' => 'Stale body.', 'published_at' => null]);

        $this->get('/pages/stale-draft')->assertNotFound();
    }

    public function test_future_published_page_is_not_negative_cached(): void
    {
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->create([
            'slug' => 'future-visible',
            'status' => PageStatus::Published,
            'published_at' => now()->addHour(),
        ]);

        $this->get('/pages/future-visible')->assertNotFound();
        $this->assertFalse(Cache::has('cms:page:future-visible'));

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => $page->title,
            'slug' => 'future-visible',
            'body' => $page->body,
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $this->get('/pages/future-visible')->assertOk();
    }
}
