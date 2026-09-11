<?php

namespace App\Listeners;

use App\Events\ExportRequested;
use App\Events\FaqCreated;
use App\Events\FaqUpdated;
use App\Events\PageCreated;
use App\Events\PagePublished;
use App\Events\PageUpdated;
use App\Models\AuditLog;
use App\Models\Export;
use App\Models\Faq;
use App\Models\Page;

class RecordAuditLog
{
    /**
     * Record a minimal, safe audit row for CMS and admin actions.
     */
    public function handle(
        PageCreated|PageUpdated|PagePublished|FaqCreated|FaqUpdated|ExportRequested $event,
    ): void {
        AuditLog::query()->create($this->payload($event));
    }

    /**
     * Build the append-only audit payload.
     *
     * @return array<string, mixed>
     */
    private function payload(
        PageCreated|PageUpdated|PagePublished|FaqCreated|FaqUpdated|ExportRequested $event,
    ): array {
        if ($event instanceof PageCreated) {
            return $this->pagePayload('page.created', $event->page, $event->actorId);
        }

        if ($event instanceof PageUpdated) {
            return $this->pagePayload('page.updated', $event->page, $event->actorId);
        }

        if ($event instanceof PagePublished) {
            return $this->pagePayload('page.published', $event->page, $event->actorId);
        }

        if ($event instanceof FaqCreated) {
            return $this->faqPayload('faq.created', $event->faq, $event->actorId);
        }

        if ($event instanceof FaqUpdated) {
            return $this->faqPayload('faq.updated', $event->faq, $event->actorId);
        }

        return $this->exportPayload($event->export);
    }

    /**
     * Build page audit metadata without storing body content.
     *
     * @return array<string, mixed>
     */
    private function pagePayload(string $action, Page $page, ?int $actorId): array
    {
        return [
            'user_id' => $actorId,
            'action' => $action,
            'auditable_type' => Page::class,
            'auditable_id' => $page->id,
            'metadata' => [
                'title' => $page->title,
                'slug' => $page->slug,
                'status' => $page->status->value,
            ],
        ];
    }

    /**
     * Build FAQ audit metadata without storing answer content.
     *
     * @return array<string, mixed>
     */
    private function faqPayload(string $action, Faq $faq, ?int $actorId): array
    {
        return [
            'user_id' => $actorId,
            'action' => $action,
            'auditable_type' => Faq::class,
            'auditable_id' => $faq->id,
            'metadata' => [
                'question' => $faq->question,
                'sort_order' => $faq->sort_order,
                'is_published' => $faq->is_published,
            ],
        ];
    }

    /**
     * Build export audit metadata without exposing paths.
     *
     * @return array<string, mixed>
     */
    private function exportPayload(Export $export): array
    {
        return [
            'user_id' => $export->user_id,
            'action' => 'export.requested',
            'auditable_type' => Export::class,
            'auditable_id' => $export->id,
            'metadata' => [
                'type' => $export->type->value,
                'status' => $export->status->value,
            ],
        ];
    }
}
