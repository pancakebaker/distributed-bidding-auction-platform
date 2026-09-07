<?php

namespace App\Notifications;

use App\Models\Page;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Notification;

class PagePublishedNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var array<int, int> */
    public array $backoff = [60, 300, 900];

    /**
     * Create a queued CMS publication notification.
     */
    public function __construct(
        public readonly int $pageId,
        public readonly string $title,
        public readonly string $slug,
    ) {}

    /**
     * Get the notification channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * Get the database notification payload.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'page_id' => $this->pageId,
            'title' => $this->title,
            'url' => route('cms.pages.show', ['page' => $this->slug]),
        ];
    }

    /**
     * Build the notification from a page without serializing the full model.
     */
    public static function fromPage(Page $page): self
    {
        return new self((int) $page->id, $page->title, $page->slug);
    }
}
