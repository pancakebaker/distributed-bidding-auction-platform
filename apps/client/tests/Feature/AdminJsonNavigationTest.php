<?php

namespace Tests\Feature;

use App\Models\Page;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminJsonNavigationTest extends TestCase
{
    use RefreshDatabase;

    public function test_guest_cannot_request_admin_json_payload(): void
    {
        $this->getJson('/admin/users')->assertUnauthorized();
    }

    public function test_non_admin_cannot_request_admin_json_payload(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->getJson('/admin/users')->assertForbidden();
    }

    public function test_admin_can_request_safe_users_json_payload(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(24)->create();

        $response = $this->actingAs($admin)->getJson('/admin/users');

        $response
            ->assertOk()
            ->assertJsonPath('page', 'users')
            ->assertJsonPath('props.pagination.current_page', 1)
            ->assertJsonPath('props.pagination.last_page', 2)
            ->assertJsonCount(20, 'props.users')
            ->assertJsonMissingPath('props.users.0.password')
            ->assertJsonMissingPath('props.users.0.remember_token');
    }

    public function test_admin_can_request_safe_pages_json_payload(): void
    {
        $admin = User::factory()->admin()->create();
        Page::factory()->published()->create([
            'title' => 'Manual',
            'slug' => 'manual',
            'created_by' => $admin->id,
            'updated_by' => $admin->id,
        ]);

        $response = $this->actingAs($admin)->getJson('/admin/pages');

        $response
            ->assertOk()
            ->assertJsonPath('page', 'pages')
            ->assertJsonPath('props.mode', 'index')
            ->assertJsonPath('props.pages.0.title', 'Manual')
            ->assertJsonMissingPath('props.pages.0.body')
            ->assertJsonMissingPath('props.pages.0.created_by')
            ->assertJsonMissingPath('props.pages.0.updated_by');
    }
}
