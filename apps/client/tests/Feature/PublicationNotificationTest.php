<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Models\NotificationPreference;
use App\Models\Page;
use App\Models\User;
use App\Notifications\PagePublishedNotification;
use App\Services\ScheduledPagePublisher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PublicationNotificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_users_without_explicit_preferences_use_enabled_notification_defaults(): void
    {
        $defaultedUser = User::factory()->create();
        Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->subMinute(), 'title' => 'Default update', 'slug' => 'default-update']);

        app(ScheduledPagePublisher::class)->publishDuePages();

        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $defaultedUser->id,
            'notifiable_type' => User::class,
            'type' => PagePublishedNotification::class,
        ]);
    }

    public function test_publication_notification_is_queueable_and_reaches_opted_in_users_only(): void
    {
        $optedIn = User::factory()->create();
        $optedOut = User::factory()->create();
        NotificationPreference::factory()->create(['user_id' => $optedIn->id]);
        NotificationPreference::factory()->create(['user_id' => $optedOut->id, 'cms_publication_updates_enabled' => false]);
        Page::factory()->create(['status' => PageStatus::Draft, 'published_at' => now()->subMinute(), 'title' => 'Public update', 'slug' => 'public-update']);

        app(ScheduledPagePublisher::class)->publishDuePages();

        $this->assertInstanceOf(ShouldQueue::class, new PagePublishedNotification(1, 'Public update', 'public-update'));
        $this->assertDatabaseHas('notifications', [
            'notifiable_id' => $optedIn->id,
            'notifiable_type' => User::class,
            'type' => PagePublishedNotification::class,
        ]);
        $this->assertDatabaseMissing('notifications', [
            'notifiable_id' => $optedOut->id,
            'notifiable_type' => User::class,
            'type' => PagePublishedNotification::class,
        ]);

        $payload = $optedIn->notifications()->firstOrFail()->data;
        $this->assertSame('Public update', $payload['title']);
        $this->assertStringEndsWith('/pages/public-update', $payload['url']);
        $this->assertArrayNotHasKey('body', $payload);
    }
}
