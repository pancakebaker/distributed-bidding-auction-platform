<?php

namespace Database\Seeders;

use App\Contracts\CmsCache;
use App\Enums\PageStatus;
use App\Models\Page;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class PageSeeder extends Seeder
{
    /**
     * Create the page seeder.
     */
    public function __construct(private readonly CmsCache $cache) {}

    /**
     * Seed deterministic public CMS pages for local/demo databases.
     */
    public function run(): void
    {
        $admin = $this->adminUser();
        $publishedAt = Carbon::parse('2026-01-01 00:00:00');

        $pages = [
            [
                'slug' => 'about',
                'title' => 'About',
                'body' => 'This distributed auction platform separates public presentation, live bidding, and real-time updates so each service can own the work it is designed to handle.',
            ],
            [
                'slug' => 'how-it-works',
                'title' => 'How It Works',
                'body' => 'Browse auctions in the client, place bids through the bidding service, and receive live updates through the feed service while Laravel manages supporting CMS content.',
            ],
            [
                'slug' => 'terms',
                'title' => 'Terms',
                'body' => 'Demo terms content for local development. Production deployments should replace this page with reviewed legal and operating terms.',
            ],
            [
                'slug' => 'privacy',
                'title' => 'Privacy',
                'body' => 'Demo privacy content for local development. Production deployments should replace this page with a reviewed privacy notice.',
            ],
        ];

        foreach ($pages as $pageData) {
            $page = Page::query()->firstOrNew(['slug' => $pageData['slug']]);
            $page->fill([
                'title' => $pageData['title'],
                'body' => $pageData['body'],
                'status' => PageStatus::Published,
                'published_at' => $publishedAt,
            ]);
            $page->forceFill([
                'created_by' => $admin->id,
                'updated_by' => $admin->id,
            ])->save();

            $this->cache->forgetPage($page->slug);
        }
    }

    /**
     * Resolve the deterministic demo administrator used as CMS author.
     */
    private function adminUser(): User
    {
        return User::query()
            ->where('email', env('DEMO_ADMIN_EMAIL', DemoAdminSeeder::DEFAULT_EMAIL))
            ->firstOrFail();
    }
}
