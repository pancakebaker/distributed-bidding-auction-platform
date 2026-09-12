<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthenticationFlowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
    }

    public function test_login_form_renders(): void
    {
        $this->get('/login')
            ->assertOk()
            ->assertSee('Sign in')
            ->assertSee('Distributed Bidding Auction Platform')
            ->assertSee('Email')
            ->assertSee('Password');
    }

    public function test_admin_can_login_and_is_redirected_to_admin(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $this->post('/login', [
            'email' => 'admin@example.com',
            'password' => 'correct-password',
        ])->assertRedirect('/admin');

        $this->assertAuthenticatedAs($admin);
    }

    public function test_normal_bidder_can_login_without_admin_access(): void
    {
        $bidder = User::factory()->create([
            'name' => 'Bidder One',
            'email' => 'bidder@example.test',
            'password' => Hash::make('correct-password'),
        ]);

        $this->post('/login', [
            'email' => 'bidder@example.test',
            'password' => 'correct-password',
        ])->assertRedirect('/auctions');

        $this->assertAuthenticatedAs($bidder);
        $this->get('/admin')->assertForbidden();
        $this->get('/auctions')->assertOk()->assertSee('Bidder One');
    }

    public function test_invalid_login_is_rejected(): void
    {
        User::factory()->admin()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $this->from('/login')->post('/login', [
            'email' => 'admin@example.com',
            'password' => 'wrong-password',
        ])->assertRedirect('/login')
            ->assertSessionHasErrors('email');

        $this->assertGuest();
    }

    public function test_authenticated_non_admin_still_cannot_access_admin(): void
    {
        $user = User::factory()->create([
            'email' => 'user@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $this->post('/login', [
            'email' => 'user@example.com',
            'password' => 'correct-password',
        ])->assertRedirect('/auctions');

        $this->assertAuthenticatedAs($user);
        $this->get('/admin')->assertForbidden();
    }

    public function test_logout_ends_the_session(): void
    {
        $admin = User::factory()->admin()->create();

        $this->actingAs($admin)->post('/logout')->assertRedirect('/login');

        $this->assertGuest();
        $this->get('/admin')->assertRedirect('/login');
    }

    public function test_bidder_login_returns_to_a_safe_intended_auction(): void
    {
        $bidder = User::factory()->create([
            'email' => 'bidder@example.test',
            'password' => Hash::make('correct-password'),
        ]);

        $this->withSession(['url.intended' => '/auctions/auction-123'])
            ->post('/login', [
                'email' => 'bidder@example.test',
                'password' => 'correct-password',
            ])
            ->assertRedirect('/auctions/auction-123');

        $this->assertAuthenticatedAs($bidder);
    }

    public function test_admin_login_preserves_an_intended_admin_page(): void
    {
        $admin = User::factory()->admin()->create([
            'email' => 'admin@example.com',
            'password' => Hash::make('correct-password'),
        ]);

        $this->withSession(['url.intended' => '/admin/auctions'])
            ->post('/login', [
                'email' => 'admin@example.com',
                'password' => 'correct-password',
            ])
            ->assertRedirect('/admin/auctions');

        $this->assertAuthenticatedAs($admin);
    }

    public function test_login_return_path_accepts_only_local_paths(): void
    {
        $bidder = User::factory()->create([
            'email' => 'bidder@example.test',
            'password' => Hash::make('correct-password'),
        ]);

        $this->get('/login?return=https://external.example.test');

        $this->post('/login', [
            'email' => 'bidder@example.test',
            'password' => 'correct-password',
        ])
            ->assertRedirect('/auctions');

        $this->assertAuthenticatedAs($bidder);
    }

    public function test_public_registration_is_not_available(): void
    {
        $this->get('/register')->assertNotFound();
        $this->post('/register')->assertNotFound();
    }

    public function test_public_react_bootstrap_exposes_only_safe_auth_state(): void
    {
        $this->get('/auctions')
            ->assertSee('Sign in')
            ->assertSee('__AUTH_BOOTSTRAP__')
            ->assertSee('authenticated')
            ->assertSee('false')
            ->assertDontSee('password');

        $this->actingAs(User::factory()->create(['name' => 'Signed-in Bidder']))
            ->get('/auctions')
            ->assertSee('Signed-in Bidder')
            ->assertSee('authenticated')
            ->assertSee('true')
            ->assertDontSee('password');
    }
}
