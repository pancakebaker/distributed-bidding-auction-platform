<?php

namespace App\Listeners;

use App\Contracts\CmsCache;
use App\Events\FaqCreated;
use App\Events\FaqUpdated;
use App\Events\PageCreated;
use App\Events\PageDeleted;
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
    public function handle(
        PageCreated|PageUpdated|PagePublished|PageDeleted|FaqCreated|FaqUpdated $event,
    ): void {
        if (
            $event instanceof PageCreated
            || $event instanceof PagePublished
            || $event instanceof PageDeleted
        ) {
            $this->cache->forgetPage($event->page->slug);
            $this->cache->forgetPublicNavigationPages();

            return;
        }

        if ($event instanceof PageUpdated) {
            if ($event->oldSlug !== null) {
                $this->cache->forgetPage($event->oldSlug);
            }

            $this->cache->forgetPage($event->page->slug);
            $this->cache->forgetPublicNavigationPages();

            return;
        }

        $this->cache->forgetFaqs();
    }
}
