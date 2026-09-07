<?php

namespace App\Support;

use App\Enums\ExportStatus;
use App\Enums\PageStatus;
use App\Models\AuditLog;
use App\Models\Export;
use App\Models\Faq;
use App\Models\Page;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class AdminBootstrapData
{
    /**
     * Build dashboard bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function dashboard(): array
    {
        $pageCounts = DB::table('pages')
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $auditActionCounts = DB::table('audit_logs')
            ->select('action', DB::raw('count(*) as total'))
            ->groupBy('action')
            ->orderByDesc('total')
            ->orderBy('action')
            ->limit(5)
            ->get()
            ->map(fn (object $row): array => [
                'action' => (string) $row->action,
                'label' => self::actionLabel((string) $row->action),
                'total' => (int) $row->total,
            ]);

        $recentAuditLogs = AuditLog::query()
            ->with('user:id,name')
            ->latest('created_at')
            ->limit(5)
            ->get()
            ->map(fn (AuditLog $log): array => self::auditLogPayload($log));

        return [
            'page' => 'dashboard',
            'navigation' => AdminNavigation::for('dashboard'),
            'props' => [
                'metrics' => [
                    ['label' => 'Total users', 'value' => User::query()->count()],
                    ['label' => 'Administrators', 'value' => User::query()->where('is_admin', true)->count()],
                    ['label' => 'Total pages', 'value' => $pageCounts->sum()],
                    ['label' => 'Published pages', 'value' => (int) ($pageCounts[PageStatus::Published->value] ?? 0)],
                    ['label' => 'Draft pages', 'value' => (int) ($pageCounts[PageStatus::Draft->value] ?? 0)],
                    ['label' => 'Published FAQs', 'value' => Faq::published()->count()],
                    ['label' => 'Audit events today', 'value' => AuditLog::query()->where('created_at', '>=', Carbon::today())->count()],
                    ['label' => 'Environment', 'value' => config('app.env')],
                    ['label' => 'Database', 'value' => config('database.default')],
                    ['label' => 'Cache', 'value' => config('cache.default')],
                    ['label' => 'Queue', 'value' => config('queue.default')],
                ],
                'recentAuditLogs' => $recentAuditLogs,
                'auditActionCounts' => $auditActionCounts,
            ],
        ];
    }

    /**
     * Build user list bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function users(): array
    {
        $users = User::query()
            ->select(['id', 'name', 'email', 'is_admin', 'created_at'])
            ->orderByDesc('created_at')
            ->orderBy('id')
            ->paginate(20)
            ->withQueryString();

        return [
            'page' => 'users',
            'navigation' => AdminNavigation::for('users'),
            'props' => [
                'users' => $users->through(fn (User $user): array => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'is_admin' => $user->is_admin,
                    'created_at' => $user->created_at?->toIso8601String(),
                ])->items(),
                'pagination' => self::pagination($users),
            ],
        ];
    }

    /**
     * Build page list bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function pages(): array
    {
        $pages = Page::query()
            ->with(['creator:id,name', 'updater:id,name'])
            ->latest()
            ->get();

        return [
            'page' => 'pages',
            'navigation' => AdminNavigation::for('pages'),
            'props' => [
                'mode' => 'index',
                'pages' => $pages->map(fn (Page $page): array => self::pageListPayload($page))->values(),
                'flash' => session('status'),
            ],
        ];
    }

    /**
     * Build page create bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function pageCreate(Request $request): array
    {
        return [
            'page' => 'pages',
            'navigation' => AdminNavigation::for('pages'),
            'props' => [
                'mode' => 'create',
                'action' => route('admin.pages.store'),
                'method' => 'POST',
                'csrfToken' => (string) $request->session()->token(),
                'statusOptions' => PageStatus::values(),
                'errors' => self::errors(),
                'page' => self::pageFormPayload(),
            ],
        ];
    }

    /**
     * Build page edit bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function pageEdit(Request $request, Page $page): array
    {
        return [
            'page' => 'pages',
            'navigation' => AdminNavigation::for('pages'),
            'props' => [
                'mode' => 'edit',
                'action' => route('admin.pages.update', $page),
                'method' => 'PUT',
                'csrfToken' => (string) $request->session()->token(),
                'statusOptions' => PageStatus::values(),
                'errors' => self::errors(),
                'flash' => session('status'),
                'page' => self::pageFormPayload($page),
            ],
        ];
    }

    /**
     * Build FAQ list bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function faqs(): array
    {
        $faqs = Faq::query()
            ->with(['creator:id,name', 'updater:id,name'])
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get();

        return [
            'page' => 'faqs',
            'navigation' => AdminNavigation::for('faqs'),
            'props' => [
                'mode' => 'index',
                'faqs' => $faqs->map(fn (Faq $faq): array => self::faqListPayload($faq))->values(),
                'flash' => session('status'),
            ],
        ];
    }

    /**
     * Build FAQ create bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function faqCreate(Request $request): array
    {
        return [
            'page' => 'faqs',
            'navigation' => AdminNavigation::for('faqs'),
            'props' => [
                'mode' => 'create',
                'action' => route('admin.faqs.store'),
                'method' => 'POST',
                'csrfToken' => (string) $request->session()->token(),
                'errors' => self::errors(),
                'faq' => self::faqFormPayload(),
            ],
        ];
    }

    /**
     * Build FAQ edit bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function faqEdit(Request $request, Faq $faq): array
    {
        return [
            'page' => 'faqs',
            'navigation' => AdminNavigation::for('faqs'),
            'props' => [
                'mode' => 'edit',
                'action' => route('admin.faqs.update', $faq),
                'method' => 'PUT',
                'csrfToken' => (string) $request->session()->token(),
                'errors' => self::errors(),
                'flash' => session('status'),
                'faq' => self::faqFormPayload($faq),
            ],
        ];
    }

    /**
     * Build audit log bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function auditLogs(): array
    {
        $logs = AuditLog::query()
            ->with('user:id,name')
            ->latest('created_at')
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return [
            'page' => 'audit-logs',
            'navigation' => AdminNavigation::for('audit-logs'),
            'props' => [
                'logs' => $logs->through(fn (AuditLog $log): array => self::auditLogPayload($log))->items(),
                'pagination' => self::pagination($logs),
            ],
        ];
    }

    /**
     * Build export status bootstrap data.
     *
     * @return array<string, mixed>
     */
    public static function exports(Request $request): array
    {
        $exports = Export::query()
            ->where('user_id', $request->user()?->id)
            ->latest()
            ->paginate(25)
            ->withQueryString();

        return [
            'page' => 'exports',
            'navigation' => AdminNavigation::for('exports'),
            'props' => [
                'requestAction' => route('admin.audit-logs.export'),
                'csrfToken' => (string) $request->session()->token(),
                'flash' => session('status'),
                'exports' => $exports->through(fn (Export $export): array => self::exportPayload($export))->items(),
                'pagination' => self::pagination($exports),
            ],
        ];
    }

    /**
     * Build pagination metadata for React.
     *
     * @param  LengthAwarePaginator<mixed>  $paginator
     * @return array<string, mixed>
     */
    private static function pagination(LengthAwarePaginator $paginator): array
    {
        return [
            'current_page' => $paginator->currentPage(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'total' => $paginator->total(),
            'from' => $paginator->firstItem(),
            'to' => $paginator->lastItem(),
            'prev_page_url' => $paginator->previousPageUrl(),
            'next_page_url' => $paginator->nextPageUrl(),
        ];
    }

    /**
     * Build a safe audit-log payload for React rendering.
     *
     * @return array<string, mixed>
     */
    private static function auditLogPayload(AuditLog $log): array
    {
        return [
            'id' => $log->id,
            'created_at' => $log->created_at?->toIso8601String(),
            'actor_name' => $log->user?->name ?? 'System',
            'action' => $log->action,
            'action_label' => self::actionLabel($log->action),
            'auditable_type' => self::resourceLabel($log->auditable_type),
            'auditable_id' => $log->auditable_id,
            'summary' => self::summary($log),
        ];
    }

    /**
     * Build the explicit list payload for one page.
     *
     * @return array<string, mixed>
     */
    private static function pageListPayload(Page $page): array
    {
        return [
            'id' => $page->id,
            'slug' => $page->slug,
            'title' => $page->title,
            'status' => $page->status->value,
            'published_at' => $page->published_at?->toIso8601String(),
            'creator_name' => $page->creator?->name,
            'updater_name' => $page->updater?->name,
            'edit_url' => route('admin.pages.edit', $page),
            'public_url' => route('cms.pages.show', $page),
        ];
    }

    /**
     * Build form data from an existing page or old input.
     *
     * @return array<string, mixed>
     */
    private static function pageFormPayload(?Page $page = null): array
    {
        return [
            'id' => $page?->id,
            'slug' => old('slug', $page?->slug ?? ''),
            'title' => old('title', $page?->title ?? ''),
            'body' => old('body', $page?->body ?? ''),
            'status' => old('status', $page?->status->value ?? PageStatus::Draft->value),
            'published_at' => old('published_at', $page?->published_at?->format('Y-m-d\TH:i') ?? ''),
        ];
    }

    /**
     * Build the explicit list payload for one FAQ.
     *
     * @return array<string, mixed>
     */
    private static function faqListPayload(Faq $faq): array
    {
        return [
            'id' => $faq->id,
            'question' => $faq->question,
            'sort_order' => $faq->sort_order,
            'is_published' => $faq->is_published,
            'creator_name' => $faq->creator?->name,
            'updater_name' => $faq->updater?->name,
            'edit_url' => route('admin.faqs.edit', $faq),
        ];
    }

    /**
     * Build form data from an existing FAQ or old input.
     *
     * @return array<string, mixed>
     */
    private static function faqFormPayload(?Faq $faq = null): array
    {
        return [
            'id' => $faq?->id,
            'question' => old('question', $faq?->question ?? ''),
            'answer' => old('answer', $faq?->answer ?? ''),
            'sort_order' => old('sort_order', (string) ($faq?->sort_order ?? 0)),
            'is_published' => (bool) old('is_published', $faq?->is_published ?? false),
        ];
    }

    /**
     * Build a safe export status payload for React.
     *
     * @return array<string, mixed>
     */
    private static function exportPayload(Export $export): array
    {
        return [
            'id' => $export->id,
            'type' => $export->type->value,
            'status' => $export->status->value,
            'created_at' => $export->created_at?->toIso8601String(),
            'completed_at' => $export->completed_at?->toIso8601String(),
            'error_message' => $export->status === ExportStatus::Failed ? $export->error_message : null,
            'download_url' => $export->status === ExportStatus::Completed ? route('admin.exports.download', $export) : null,
        ];
    }

    /**
     * Build validation error payloads for React form rendering.
     *
     * @return array<string, array<int, string>>
     */
    private static function errors(): array
    {
        return session('errors')?->getBag('default')->toArray() ?? [];
    }

    /**
     * Build a readable action label.
     */
    private static function actionLabel(string $action): string
    {
        return str($action)->replace('.', ' ')->headline()->toString();
    }

    /**
     * Build a readable resource label without exposing internal metadata.
     */
    private static function resourceLabel(?string $type): ?string
    {
        return match ($type) {
            'App\Models\Page' => 'Page',
            'App\Models\Faq' => 'FAQ',
            default => $type,
        };
    }

    /**
     * Build a concise safe metadata summary.
     */
    private static function summary(AuditLog $log): string
    {
        $metadata = $log->metadata ?? [];

        if (isset($metadata['title'])) {
            return (string) $metadata['title'];
        }

        if (isset($metadata['question'])) {
            return (string) $metadata['question'];
        }

        return 'No summary';
    }
}
