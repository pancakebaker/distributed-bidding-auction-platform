<?php

namespace App\Events;

use App\Models\Page;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class PagePublished
{
    use Dispatchable;
    use SerializesModels;

    /**
     * Create a page publication event.
     */
    public function __construct(
        public readonly Page $page,
        public readonly ?int $actorId,
    ) {}
}
