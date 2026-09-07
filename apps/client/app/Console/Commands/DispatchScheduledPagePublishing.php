<?php

namespace App\Console\Commands;

use App\Jobs\PublishScheduledPages;
use Illuminate\Console\Command;

class DispatchScheduledPagePublishing extends Command
{
    protected $signature = 'cms:publish-scheduled-pages';

    protected $description = 'Dispatch the queued job that publishes eligible scheduled CMS pages.';

    /**
     * Dispatch the scheduled publishing job.
     */
    public function handle(): int
    {
        PublishScheduledPages::dispatch();
        $this->info('Scheduled page publishing job dispatched.');

        return self::SUCCESS;
    }
}
