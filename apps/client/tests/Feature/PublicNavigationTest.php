<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Events\PageCreated;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicNavigationTest extends TestCase
{
    use RefreshDatabase;

    public function test_shared_navigation_appears_on_auction_pages_and_lists_public_cms_pages(): void
    {
        $this->withoutVite();
        $published = Page::factory()->published()->create([
            'title' => 'About our auctions',
            'slug' => 'about-our-auctions',
        ]);
        Page::factory()->create([
            'title' => 'Draft page',
            'slug' => 'draft-page',
        ]);
        Page::factory()->create([
            'title' => 'Future page',
            'slug' => 'future-page',
            'status' => PageStatus::Published,
            'published_at' => now()->addHour(),
        ]);

        $this->get('/auctions')
            ->assertOk()
            ->assertSee('Public navigation', false)
            ->assertSee('>Auctions<', false)
            ->assertSee('About our auctions')
            ->assertSee(route('cms.pages.show', $published), false)
            ->assertDontSee('Draft page')
            ->assertDontSee('Future page');

        $this->get('/auctions/1')
            ->assertOk()
            ->assertSee('About our auctions');
    }

    public function test_shared_navigation_appears_on_cms_pages_and_newly_published_pages_are_derived_from_cms_data(): void
    {
        $this->withoutVite();
        $first = Page::factory()->published()->create([
            'title' => 'First public page',
            'slug' => 'first-public-page',
        ]);

        $this->get('/pages/first-public-page')
            ->assertOk()
            ->assertSee('Public navigation', false)
            ->assertSee('First public page')
            ->assertSee(route('cms.pages.show', $first), false);

        $newlyPublished = Page::factory()->published()->create([
            'title' => 'Newly published page',
            'slug' => 'newly-published-page',
        ]);
        PageCreated::dispatch($newlyPublished, null);

        $this->get('/pages/first-public-page')
            ->assertOk()
            ->assertSee('Newly published page')
            ->assertSee(route('cms.pages.show', $newlyPublished), false);
    }

    public function test_navigation_cache_is_invalidated_when_a_published_page_becomes_draft_or_is_deleted(): void
    {
        $this->withoutVite();
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->published()->create([
            'title' => 'Temporarily public page',
            'slug' => 'temporarily-public-page',
        ]);

        $this->get('/auctions')
            ->assertSee('Temporarily public page');

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => $page->title,
            'slug' => $page->slug,
            'body' => $page->body,
            'status' => 'draft',
            'published_at' => null,
        ])->assertRedirect();

        $this->get('/auctions')
            ->assertDontSee('Temporarily public page');

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => $page->title,
            'slug' => $page->slug,
            'body' => $page->body,
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $this->get('/auctions')
            ->assertSee('Temporarily public page');

        $page->delete();

        $this->get('/auctions')
            ->assertDontSee('Temporarily public page');
    }
}
