<?php

namespace App\Services;

use App\Contracts\CmsCache;
use App\Models\Faq;
use App\Models\Page;
use Illuminate\Contracts\Cache\Repository;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

class LaravelCmsCache implements CmsCache
{
    private const FAQ_KEY = 'cms:faqs';

    private const PUBLIC_NAVIGATION_KEY = 'cms:public-navigation-pages';

    /**
     * Create the Laravel cache-backed CMS reader.
     */
    public function __construct(private readonly Repository $cache) {}

    /**
     * Get a publicly visible CMS page by slug.
     *
     * Missing, draft, and future-published pages are not negative-cached so
     * scheduled content can become visible as soon as it is eligible.
     *
     * @return array{title: string, body: string, published_at: string|null}|null
     */
    public function getPage(string $slug): ?array
    {
        $key = $this->pageKey($slug);
        $cached = $this->cache->get($key);

        if (is_array($cached)) {
            return $cached;
        }

        $page = Page::published()
            ->where('slug', $slug)
            ->first(['title', 'body', 'published_at']);

        if (! $page instanceof Page) {
            return null;
        }

        $payload = [
            'title' => $page->title,
            'body' => $page->body,
            'published_at' => $page->published_at?->toIso8601String(),
        ];

        $this->cache->put($key, $payload, Carbon::now()->addMinutes(30));

        return $payload;
    }

    /**
     * Get the stable, publicly visible CMS page links for the site shell.
     *
     * Pages do not have an explicit navigation order, so the existing page
     * identifier provides deterministic ordering without adding CMS fields.
     *
     * @return array<int, array{title: string, slug: string}>
     */
    public function getPublicNavigationPages(): array
    {
        if (! Schema::hasTable('pages')) {
            return [];
        }

        return $this->cache->remember(self::PUBLIC_NAVIGATION_KEY, Carbon::now()->addMinutes(30), function (): array {
            return Page::published()
                ->orderBy('id')
                ->get(['title', 'slug'])
                ->map(fn (Page $page): array => [
                    'title' => $page->title,
                    'slug' => $page->slug,
                ])
                ->values()
                ->all();
        });
    }

    /**
     * Remove the cached public navigation page list.
     */
    public function forgetPublicNavigationPages(): void
    {
        $this->cache->forget(self::PUBLIC_NAVIGATION_KEY);
    }

    /**
     * Remove the cached public page payload for a slug.
     */
    public function forgetPage(string $slug): void
    {
        $this->cache->forget($this->pageKey($slug));
    }

    /**
     * Get the public FAQ payload.
     *
     * @return array<int, array{id: int, question: string, answer: string}>
     */
    public function getFaqs(): array
    {
        return $this->cache->remember(self::FAQ_KEY, Carbon::now()->addMinutes(30), function (): array {
            return Faq::published()
                ->orderBy('sort_order')
                ->orderBy('id')
                ->get(['id', 'question', 'answer'])
                ->map(fn (Faq $faq): array => [
                    'id' => $faq->id,
                    'question' => $faq->question,
                    'answer' => $faq->answer,
                ])
                ->values()
                ->all();
        });
    }

    /**
     * Remove the cached public FAQ payload.
     */
    public function forgetFaqs(): void
    {
        $this->cache->forget(self::FAQ_KEY);
    }

    /**
     * Build the public page cache key.
     */
    private function pageKey(string $slug): string
    {
        return "cms:page:{$slug}";
    }
}
