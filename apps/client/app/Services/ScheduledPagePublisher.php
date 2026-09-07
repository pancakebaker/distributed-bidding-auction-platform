<?php

namespace App\Services;

use App\Enums\PageStatus;
use App\Events\PagePublished;
use App\Models\Page;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class ScheduledPagePublisher
{
    /**
     * Publish eligible draft pages and emit one semantic publication event per page.
     *
     * @return Collection<int, Page>
     */
    public function publishDuePages(?int $actorId = null): Collection
    {
        $published = collect();

        Page::query()
            ->where('status', PageStatus::Draft->value)
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now())
            ->orderBy('id')
            ->select(['id'])
            ->chunkById(100, function (Collection $pages) use ($published, $actorId): void {
                foreach ($pages as $candidate) {
                    $updated = DB::table('pages')
                        ->where('id', $candidate->id)
                        ->where('status', PageStatus::Draft->value)
                        ->whereNotNull('published_at')
                        ->where('published_at', '<=', now())
                        ->update([
                            'status' => PageStatus::Published->value,
                            'updated_at' => now(),
                        ]);

                    if ($updated === 1) {
                        $page = Page::query()->findOrFail($candidate->id);
                        $published->push($page);
                        PagePublished::dispatch($page, $actorId);
                    }
                }
            });

        return $published;
    }
}
