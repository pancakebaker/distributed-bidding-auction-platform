<?php

namespace Tests\Feature;

use App\Events\FaqCreated;
use App\Events\FaqUpdated;
use App\Events\PageCreated;
use App\Events\PageUpdated;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class CmsEventsTest extends TestCase
{
    use RefreshDatabase;

    public function test_page_create_dispatches_event_after_persistence(): void
    {
        Event::fake([PageCreated::class]);
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/admin/pages', [
            'title' => 'About',
            'slug' => 'about',
            'body' => 'About text.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $page = Page::query()->where('slug', 'about')->firstOrFail();
        Event::assertDispatched(PageCreated::class, fn (PageCreated $event): bool => $event->page->is($page)
            && $event->actorId === $admin->id);
    }

    public function test_page_update_dispatches_event_with_old_slug(): void
    {
        Event::fake([PageUpdated::class]);
        $admin = User::factory()->admin()->create();
        $page = Page::factory()->create(['slug' => 'old-slug']);

        $this->actingAs($admin)->put(route('admin.pages.update', $page), [
            'title' => 'New title',
            'slug' => 'new-slug',
            'body' => 'Updated text.',
            'status' => 'published',
            'published_at' => now()->subMinute()->toDateTimeString(),
        ])->assertRedirect();

        $page->refresh();
        Event::assertDispatched(PageUpdated::class, fn (PageUpdated $event): bool => $event->page->is($page)
            && $event->oldSlug === 'old-slug'
            && $event->actorId === $admin->id);
    }

    public function test_faq_create_and_update_dispatch_events(): void
    {
        Event::fake([FaqCreated::class, FaqUpdated::class]);
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/admin/faqs', [
            'question' => 'Can I bid?',
            'answer' => 'Yes.',
            'sort_order' => 1,
            'is_published' => true,
        ])->assertRedirect();

        $faq = Faq::query()->where('question', 'Can I bid?')->firstOrFail();
        Event::assertDispatched(FaqCreated::class, fn (FaqCreated $event): bool => $event->faq->is($faq)
            && $event->actorId === $admin->id);

        $this->actingAs($admin)->put(route('admin.faqs.update', $faq), [
            'question' => 'Can I still bid?',
            'answer' => 'Yes.',
            'sort_order' => 2,
            'is_published' => true,
        ])->assertRedirect();

        $faq->refresh();
        Event::assertDispatched(FaqUpdated::class, fn (FaqUpdated $event): bool => $event->faq->is($faq)
            && $event->actorId === $admin->id);
    }
}
