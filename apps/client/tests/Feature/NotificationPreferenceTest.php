<?php

namespace Tests\Feature;

use App\Models\NotificationPreference;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationPreferenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_authenticated_user_gets_default_notification_preferences(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user)->get('/account/notifications');
        $response->assertOk();

        $preferences = $response->viewData('adminBootstrap')['props']['preferences'];
        $this->assertTrue($preferences['cms_publication_updates_enabled']);
        $this->assertTrue($preferences['database_notifications_enabled']);
    }

    public function test_user_updates_only_their_own_notification_preferences(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        NotificationPreference::factory()->create(['user_id' => $other->id, 'cms_publication_updates_enabled' => true]);

        $this->actingAs($user)->put('/account/notifications', [
            'cms_publication_updates_enabled' => false,
            'database_notifications_enabled' => true,
            'user_id' => $other->id,
        ])->assertRedirect('/account/notifications');

        $this->assertFalse($user->notificationPreference()->firstOrFail()->cms_publication_updates_enabled);
        $this->assertTrue($other->notificationPreference()->firstOrFail()->cms_publication_updates_enabled);
    }
}
