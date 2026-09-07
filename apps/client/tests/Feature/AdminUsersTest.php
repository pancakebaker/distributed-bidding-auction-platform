<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUsersTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_guest_cannot_access_admin_users(): void
    {
        $this->get('/admin/users')->assertRedirect('/login');
    }

    public function test_authenticated_non_admin_cannot_access_admin_users(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user)->get('/admin/users')->assertForbidden();
    }

    public function test_admin_can_access_admin_users(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->get('/admin/users')->assertOk();
    }

    public function test_admin_users_payload_contains_expected_user_data_without_sensitive_fields(): void
    {
        $admin = User::factory()->admin()->create([
            'name' => 'Ada Admin',
            'email' => 'ada.admin@example.com',
        ]);
        $user = User::factory()->create([
            'name' => 'Nora Normal',
            'email' => 'nora.normal@example.com',
        ]);

        $response = $this->actingAs($admin)->get('/admin/users');
        $response->assertOk();

        $bootstrap = $response->viewData('adminBootstrap');
        $this->assertSame('users', $bootstrap['page']);

        $users = collect($bootstrap['props']['users']);
        $normalPayload = $users->firstWhere('email', 'nora.normal@example.com');
        $adminPayload = $users->firstWhere('email', 'ada.admin@example.com');

        $this->assertSame('Nora Normal', $normalPayload['name']);
        $this->assertFalse($normalPayload['is_admin']);
        $this->assertTrue($adminPayload['is_admin']);
        $this->assertArrayHasKey('created_at', $normalPayload);
        $this->assertArrayNotHasKey('password', $normalPayload);
        $this->assertArrayNotHasKey('remember_token', $normalPayload);

        $response->assertDontSee($user->password);
        $response->assertDontSee('remember_token');
    }

    public function test_admin_users_uses_server_side_pagination(): void
    {
        $admin = User::factory()->admin()->create();
        User::factory()->count(24)->create();

        $firstPage = $this->actingAs($admin)->get('/admin/users');
        $firstPage->assertOk();

        $firstPageBootstrap = $firstPage->viewData('adminBootstrap');
        $this->assertCount(20, $firstPageBootstrap['props']['users']);
        $this->assertSame(1, $firstPageBootstrap['props']['pagination']['current_page']);
        $this->assertSame(2, $firstPageBootstrap['props']['pagination']['last_page']);
        $this->assertSame(25, $firstPageBootstrap['props']['pagination']['total']);
        $this->assertNotNull($firstPageBootstrap['props']['pagination']['next_page_url']);

        $secondPage = $this->actingAs($admin)->get('/admin/users?page=2');
        $secondPage->assertOk();

        $secondPageBootstrap = $secondPage->viewData('adminBootstrap');
        $this->assertCount(5, $secondPageBootstrap['props']['users']);
        $this->assertSame(2, $secondPageBootstrap['props']['pagination']['current_page']);
        $this->assertNull($secondPageBootstrap['props']['pagination']['next_page_url']);
    }
}
