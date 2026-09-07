<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Events\PagePublished;
use App\Jobs\PublishScheduledPages;
use App\Models\AuditLog;
use App\Models\Page;
use App\Services\ScheduledPagePublisher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class ScheduledPublishingTest extends TestCase
{
    use RefreshDatabase;

    public function test_publisher_identifies_only_eligible_draft_pages(): void
    {
        $eligible = Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->subMinute(), 'slug' => 'eligible']);
        $future = Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->addHour(), 'slug' => 'future']);
        $published = Page::factory()->published()->create(['slug' => 'already-published']);

        app(ScheduledPagePublisher::class)->publishDuePages();

        $this->assertSame(PageStatus::Published, $eligible->fresh()->status);
        $this->assertSame(PageStatus::Draft, $future->fresh()->status);
        $this->assertSame(PageStatus::Published, $published->fresh()->status);
    }

    public function test_publisher_is_idempotent_and_emits_publication_once(): void
    {
        Event::fake([PagePublished::class]);
        $page = Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->subMinute()]);
        $publisher = app(ScheduledPagePublisher::class);

        $this->assertCount(1, $publisher->publishDuePages());
        $this->assertCount(0, $publisher->publishDuePages());

        Event::assertDispatchedTimes(PagePublished::class, 1);
        Event::assertDispatched(PagePublished::class, fn (PagePublished $event): bool => $event->page->is($page));
    }

    public function test_publication_invalidates_cache_and_creates_audit_record(): void
    {
        $page = Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->subMinute(), 'slug' => 'scheduled']);
        Cache::put('cms:page:scheduled', ['title' => 'Stale', 'body' => 'Stale', 'published_at' => null]);

        app(ScheduledPagePublisher::class)->publishDuePages();

        $this->assertFalse(Cache::has('cms:page:scheduled'));
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'page.published',
            'auditable_type' => Page::class,
            'auditable_id' => $page->id,
        ]);
        $this->assertSame(1, AuditLog::query()->where('action', 'page.published')->count());
    }

    public function test_cms_publish_scheduled_pages_command_dispatches_job(): void
    {
        Queue::fake();

        $this->artisan('cms:publish-scheduled-pages')->assertSuccessful();

        Queue::assertPushed(PublishScheduledPages::class);
    }
}
