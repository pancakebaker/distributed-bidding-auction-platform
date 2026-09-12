<?php

namespace Tests\Feature;

use App\Enums\PageStatus;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DemoCmsSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_database_seeder_creates_default_public_pages_and_faqs(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseHas('users', [
            'email' => 'admin@example.test',
            'is_admin' => true,
        ]);

        foreach (['about', 'how-it-works', 'terms', 'privacy'] as $slug) {
            $this->assertDatabaseHas('pages', [
                'slug' => $slug,
                'status' => PageStatus::Published->value,
            ]);
        }

        $this->assertSame(4, Page::query()->count());
        $this->assertSame(6, Faq::query()->count());
        $this->assertSame(6, Faq::published()->count());
    }

    public function test_database_seeder_is_idempotent(): void
    {
        $this->seed(DatabaseSeeder::class);
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(1, User::query()->where('email', 'admin@example.test')->count());
        $this->assertSame(4, Page::query()->count());
        $this->assertSame(6, Faq::query()->count());
    }

    public function test_seeded_pages_and_faqs_have_valid_creator_and_updater_relationships(): void
    {
        $this->seed(DatabaseSeeder::class);

        Page::query()->each(function (Page $page): void {
            $this->assertTrue($page->isPubliclyVisible());
            $this->assertNotNull($page->creator);
            $this->assertNotNull($page->updater);
            $this->assertTrue($page->creator->is_admin);
            $this->assertTrue($page->updater->is_admin);
        });

        Faq::query()->each(function (Faq $faq): void {
            $this->assertTrue($faq->is_published);
            $this->assertNotNull($faq->creator);
            $this->assertNotNull($faq->updater);
            $this->assertTrue($faq->creator->is_admin);
            $this->assertTrue($faq->updater->is_admin);
        });
    }

    public function test_seeded_public_cms_routes_render_demo_content(): void
    {
        $this->withoutVite();
        $this->seed(DatabaseSeeder::class);

        $this->get('/pages/about')
            ->assertOk()
            ->assertSee('About')
            ->assertSee('distributed auction platform');

        $this->get('/faq')
            ->assertOk()
            ->assertSee('How do I place a bid?')
            ->assertSee('How do live auction updates work?');
    }

    public function test_database_seeder_creates_configured_local_admin_in_local_environment(): void
    {
        config(['app.env' => 'local']);
        putenv('LOCAL_ADMIN_EMAIL=local-admin@example.test');
        putenv('LOCAL_ADMIN_PASSWORD=local-admin-password');
        $_ENV['LOCAL_ADMIN_EMAIL'] = 'local-admin@example.test';
        $_ENV['LOCAL_ADMIN_PASSWORD'] = 'local-admin-password';

        try {
            $this->seed(DatabaseSeeder::class);

            $this->assertDatabaseHas('users', [
                'email' => 'local-admin@example.test',
                'is_admin' => true,
            ]);
        } finally {
            putenv('LOCAL_ADMIN_EMAIL');
            putenv('LOCAL_ADMIN_PASSWORD');
            unset($_ENV['LOCAL_ADMIN_EMAIL'], $_ENV['LOCAL_ADMIN_PASSWORD']);
        }
    }
}
