<?php

namespace App\Events;

use App\Models\Faq;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class FaqCreated
{
    use Dispatchable;
    use SerializesModels;

    /**
     * Create an FAQ creation event.
     */
    public function __construct(
        public readonly Faq $faq,
        public readonly ?int $actorId,
    ) {}
}
