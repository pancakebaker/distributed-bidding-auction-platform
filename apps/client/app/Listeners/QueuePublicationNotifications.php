<?php

namespace App\Listeners;

use App\Events\PagePublished;
use App\Models\User;
use App\Notifications\PagePublishedNotification;

class QueuePublicationNotifications
{
    /**
     * Queue database notifications for users who opted into CMS publication updates.
     */
    public function handle(PagePublished $event): void
    {
        User::query()
            ->where(function ($query): void {
                $query->whereDoesntHave('notificationPreference')
                    ->orWhereHas('notificationPreference', function ($query): void {
                        $query->where('cms_publication_updates_enabled', true)
                            ->where('database_notifications_enabled', true);
                    });
            })
            ->select(['id'])
            ->chunkById(100, function ($users) use ($event): void {
                foreach ($users as $user) {
                    $user->notify(PagePublishedNotification::fromPage($event->page));
                }
            });
    }
}
