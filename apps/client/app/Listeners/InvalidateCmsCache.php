<?php

namespace App\Listeners;

use App\Contracts\CmsCache;
use App\Events\FaqCreated;
use App\Events\FaqUpdated;
use App\Events\PageCreated;
use App\Events\PagePublished;
use App\Events\PageUpdated;

class InvalidateCmsCache
{
    /**
     * Create the cache invalidation listener.
     */
    public function __construct(private readonly CmsCache $cache) {}

    /**
     * Forget affected public CMS cache entries after a successful CMS write.
     */
    public function handle(PageCreated|PageUpdated|PagePublished|FaqCreated|FaqUpdated $event): void
    {
        if ($event instanceof PageCreated || $event instanceof PagePublished) {
            $this->cache->forgetPage($event->page->slug);

            return;
        }

        if ($event instanceof PageUpdated) {
            if ($event->oldSlug !== null) {
                $this->cache->forgetPage($event->oldSlug);
            }

            $this->cache->forgetPage($event->page->slug);

            return;
        }

        $this->cache->forgetFaqs();
    }
}
