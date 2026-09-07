<?php

namespace App\Events;

use App\Models\Page;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PageUpdated
{
    use Dispatchable;
    use SerializesModels;

    /**
     * Create a page update event.
     */
    public function __construct(
        public readonly Page $page,
        public readonly ?int $actorId,
        public readonly ?string $oldSlug,
    ) {}
}
