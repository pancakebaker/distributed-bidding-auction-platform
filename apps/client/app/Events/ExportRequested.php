<?php

namespace App\Events;

use App\Models\Export;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ExportRequested
{
    use Dispatchable;
    use SerializesModels;

    /**
     * Create an export request event.
     */
    public function __construct(public readonly Export $export) {}
}
