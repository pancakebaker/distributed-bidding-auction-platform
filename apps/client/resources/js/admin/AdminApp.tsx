/**
 * React administration shell for Laravel-owned dashboard, user, CMS, and audit-log views.
 */
import React, { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { AuctionManagementPage } from './AuctionManagementPage';

type AdminPage =
    | 'dashboard'
    | 'users'
    | 'pages'
    | 'faqs'
    | 'audit-logs'
    | 'exports'
    | 'notification-preferences'
    | 'auctions';

type AdminNavigationItem = {
    label: string;
    href: string;
    active: boolean;
    target?: string;
    rel?: string;
};

type DashboardMetric = {
    label: string;
    value: string | number;
};

type AuditActionCount = {
    action: string;
    label: string;
    total: number;
};

type AuditLogRow = {
    id: number;
    created_at: string | null;
    actor_name: string;
    action: string;
    action_label: string;
    auditable_type: string | null;
    auditable_id: number | null;
    summary: string;
};

type ExportRow = {
    id: number;
    type: string;
    status: string;
    created_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    download_url: string | null;
};

type NotificationPreferences = {
    cms_publication_updates_enabled: boolean;
    database_notifications_enabled: boolean;
};

type AdminUser = {
    id: number;
    name: string;
    email: string;
    is_admin: boolean;
    created_at: string | null;
};

type Pagination = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    prev_page_url: string | null;
    next_page_url: string | null;
};

type CmsPageRow = {
    id: number;
    slug: string;
    title: string;
    status: string;
    published_at: string | null;
    creator_name: string | null;
    updater_name: string | null;
    edit_url: string;
    public_url: string;
};

type CmsPageForm = {
    id: number | null;
    slug: string;
    title: string;
    body: string;
    status: string;
    published_at: string;
};

type FaqRow = {
    id: number;
    question: string;
    sort_order: number;
    is_published: boolean;
    creator_name: string | null;
    updater_name: string | null;
    edit_url: string;
};

type FaqForm = {
    id: number | null;
    question: string;
    answer: string;
    sort_order: string;
    is_published: boolean;
};

type ValidationErrors = Record<string, string[]>;

type DashboardBootstrap = {
    page: 'dashboard';
    navigation: AdminNavigationItem[];
    props: {
        metrics: DashboardMetric[];
        recentAuditLogs: AuditLogRow[];
        auditActionCounts: AuditActionCount[];
    };
};

type UsersBootstrap = {
    page: 'users';
    navigation: AdminNavigationItem[];
    props: { users: AdminUser[]; pagination: Pagination };
};

type PagesBootstrap = {
    page: 'pages';
    navigation: AdminNavigationItem[];
    props:
        | { mode: 'index'; pages: CmsPageRow[]; flash?: string | null }
        | {
              mode: 'create' | 'edit';
              action: string;
              method: 'POST' | 'PUT';
              csrfToken: string;
              statusOptions: string[];
              errors: ValidationErrors;
              flash?: string | null;
              page: CmsPageForm;
          };
};

type FaqsBootstrap = {
    page: 'faqs';
    navigation: AdminNavigationItem[];
    props:
        | { mode: 'index'; faqs: FaqRow[]; flash?: string | null }
        | {
              mode: 'create' | 'edit';
              action: string;
              method: 'POST' | 'PUT';
              csrfToken: string;
              errors: ValidationErrors;
              flash?: string | null;
              faq: FaqForm;
          };
};

type AuditLogsBootstrap = {
    page: 'audit-logs';
    navigation: AdminNavigationItem[];
    props: { logs: AuditLogRow[]; pagination: Pagination };
};

type ExportsBootstrap = {
    page: 'exports';
    navigation: AdminNavigationItem[];
    props: {
        requestAction: string;
        csrfToken: string;
        flash?: string | null;
        exports: ExportRow[];
        pagination: Pagination;
    };
};

type NotificationPreferencesBootstrap = {
    page: 'notification-preferences';
    navigation: AdminNavigationItem[];
    props: {
        action: string;
        csrfToken: string;
        flash?: string | null;
        errors: ValidationErrors;
        preferences: NotificationPreferences;
    };
};

type AuctionsBootstrap = {
    page: 'auctions';
    navigation: AdminNavigationItem[];
    props: Record<string, never>;
};

type AdminBootstrap =
    | DashboardBootstrap
    | UsersBootstrap
    | PagesBootstrap
    | FaqsBootstrap
    | AuditLogsBootstrap
    | ExportsBootstrap
    | NotificationPreferencesBootstrap
    | AuctionsBootstrap;
type AdminNavigationState = {
    bootstrap: AdminBootstrap;
    error: string | null;
    loading: boolean;
    navigate: (event: React.MouseEvent<HTMLElement>) => void;
    retry: () => void;
};

declare global {
    interface Window {
        __ADMIN_BOOTSTRAP__?: AdminBootstrap;
    }
}

function formatDate(value: string | null) {
    if (!value) {
        return 'Not scheduled';
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    }).format(new Date(value));
}

function formatDateTime(value: string | null) {
    if (!value) {
        return 'Unknown';
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    }).format(new Date(value));
}

/**
 * Derives common pagination labels and link state for admin tables.
 */
export function useAdminPagination(pagination: Pagination) {
    const rangeLabel = `Showing ${pagination.from ?? 0}-${pagination.to ?? 0} of ${pagination.total}`;
    const pageLabel = `Page ${pagination.current_page} of ${pagination.last_page}`;

    return {
        rangeLabel,
        pageLabel,
        previousUrl: pagination.prev_page_url,
        nextUrl: pagination.next_page_url,
    };
}

/**
 * Loads authorized admin page data through same-origin Laravel routes without remounting the shell.
 */
export function useAdminNavigation(initialBootstrap: AdminBootstrap): AdminNavigationState {
    const [bootstrap, setBootstrap] = useState(initialBootstrap);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const navigationIdRef = useRef(0);
    const retryUrlRef = useRef<string | null>(null);

    const loadPage = useCallback(async (href: string, pushHistory: boolean) => {
        const target = new URL(href, window.location.href);
        const controller = new AbortController();
        const navigationId = navigationIdRef.current + 1;

        navigationIdRef.current = navigationId;
        abortRef.current?.abort();
        abortRef.current = controller;
        retryUrlRef.current = target.href;
        setLoading(true);
        setError(null);

        try {
            const response = await fetch(target.href, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                signal: controller.signal,
            });

            if (navigationId !== navigationIdRef.current) {
                return;
            }

            if (response.status === 401 || response.status === 403) {
                window.location.assign(target.href);

                return;
            }

            if (!response.ok) {
                throw new Error(`Admin page request failed with status ${response.status}.`);
            }

            const nextBootstrap = (await response.json()) as AdminBootstrap;

            if (navigationId !== navigationIdRef.current) {
                return;
            }

            setBootstrap(nextBootstrap);
            retryUrlRef.current = null;

            if (pushHistory) {
                window.history.pushState({ admin: true }, '', target.href);
            }
        } catch (loadError) {
            if (
                navigationId !== navigationIdRef.current ||
                (loadError instanceof DOMException && loadError.name === 'AbortError')
            ) {
                return;
            }

            setError('Could not load the admin page.');
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
                setLoading(false);
            }
        }
    }, []);

    const navigate = useCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            const target = event.target;
            const anchor = target instanceof Element ? target.closest('a') : null;

            if (
                !(anchor instanceof HTMLAnchorElement) ||
                !shouldInterceptAdminLink(event, anchor)
            ) {
                return;
            }

            event.preventDefault();
            void loadPage(anchor.href, true);
        },
        [loadPage],
    );

    const retry = useCallback(() => {
        if (retryUrlRef.current) {
            void loadPage(retryUrlRef.current, false);
        }
    }, [loadPage]);

    useEffect(() => {
        function handlePopState() {
            void loadPage(window.location.href, false);
        }

        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('popstate', handlePopState);
            navigationIdRef.current += 1;
            abortRef.current?.abort();
        };
    }, [loadPage]);

    return { bootstrap, error, loading, navigate, retry };
}

function shouldInterceptAdminLink(event: React.MouseEvent<HTMLElement>, anchor: HTMLAnchorElement) {
    if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        anchor.hasAttribute('download') ||
        (anchor.target !== '' && anchor.target !== '_self')
    ) {
        return false;
    }

    const target = new URL(anchor.href, window.location.href);

    return (
        target.origin === window.location.origin &&
        target.pathname.startsWith('/admin') &&
        !target.pathname.endsWith('/download')
    );
}
/**
 * Renders the authorized admin page selected by Laravel bootstrap data.
 */
export function AdminApp({ bootstrap }: { bootstrap: AdminBootstrap }) {
    const navigation = useAdminNavigation(bootstrap);

    return (
        <AdminLayout
            error={navigation.error}
            loading={navigation.loading}
            navigation={navigation.bootstrap.navigation}
            onNavigate={navigation.navigate}
            onRetry={navigation.retry}
            page={navigation.bootstrap.page}
        >
            {navigation.bootstrap.page === 'dashboard' && (
                <DashboardPage {...navigation.bootstrap.props} />
            )}
            {navigation.bootstrap.page === 'users' && <UsersPage {...navigation.bootstrap.props} />}
            {navigation.bootstrap.page === 'pages' && renderPagesPage(navigation.bootstrap.props)}
            {navigation.bootstrap.page === 'faqs' && renderFaqsPage(navigation.bootstrap.props)}
            {navigation.bootstrap.page === 'audit-logs' && (
                <AuditLogPage {...navigation.bootstrap.props} />
            )}
            {navigation.bootstrap.page === 'exports' && (
                <ExportsPage {...navigation.bootstrap.props} />
            )}
            {navigation.bootstrap.page === 'notification-preferences' && (
                <NotificationPreferencesPage {...navigation.bootstrap.props} />
            )}
            {navigation.bootstrap.page === 'auctions' && <AuctionManagementPage />}
        </AdminLayout>
    );
}
function AdminLayout({
    children,
    error,
    loading,
    navigation,
    onNavigate,
    onRetry,
    page,
}: {
    children: React.ReactNode;
    error: string | null;
    loading: boolean;
    navigation: AdminNavigationItem[];
    onNavigate: (event: React.MouseEvent<HTMLElement>) => void;
    onRetry: () => void;
    page: AdminPage;
}) {
    return (
        <main className="admin-shell" onClickCapture={onNavigate}>
            <AdminSidebar navigation={navigation} />
            <section aria-busy={loading} aria-label="Admin content" className="admin-main">
                <AdminHeader page={page} />
                {loading && (
                    <div
                        aria-label="Loading admin page"
                        className="admin-navigation-progress"
                        role="status"
                    >
                        <span className="admin-navigation-progress-label">
                            Loading admin page...
                        </span>
                    </div>
                )}
                {error && <NavigationError message={error} onRetry={onRetry} />}
                {children}
            </section>
        </main>
    );
}
function AdminSidebar({ navigation }: { navigation: AdminNavigationItem[] }) {
    return (
        <aside className="admin-sidebar" aria-label="Admin navigation">
            <a className="admin-brand" href="/admin">
                Auction Admin
            </a>
            <nav>
                {navigation.map((item) => (
                    <a
                        className={item.active ? 'active' : undefined}
                        href={item.href}
                        key={item.href}
                        rel={item.rel}
                        target={item.target}
                    >
                        {item.label}
                    </a>
                ))}
            </nav>
        </aside>
    );
}

function AdminHeader({ page }: { page: AdminPage }) {
    const titles: Record<AdminPage, string> = {
        dashboard: 'Dashboard',
        users: 'Users',
        pages: 'Pages',
        faqs: 'FAQs',
        'audit-logs': 'Audit Log',
        exports: 'Exports',
        'notification-preferences': 'Notification Preferences',
        auctions: 'Auction Management',
    };

    return (
        <header className="admin-header">
            <div>
                <p className="eyebrow">Laravel administration</p>
                <h1>{titles[page]}</h1>
            </div>
            <a className="admin-public-link" href="/auctions">
                View auctions
            </a>
        </header>
    );
}

function NavigationError({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <section className="state-message error">
            <h2>Admin page unavailable</h2>
            <p>{message}</p>
            <button className="primary-button" onClick={onRetry} type="button">
                Retry
            </button>
        </section>
    );
}
function DashboardPage({
    auditActionCounts,
    metrics,
    recentAuditLogs,
}: {
    auditActionCounts: AuditActionCount[];
    metrics: DashboardMetric[];
    recentAuditLogs: AuditLogRow[];
}) {
    return (
        <>
            <section className="admin-card-grid" aria-label="Application metrics">
                {metrics.map((metric) => (
                    <article className="admin-metric-card" key={metric.label}>
                        <span>{metric.label}</span>
                        <strong>{metric.value}</strong>
                    </article>
                ))}
            </section>
            <section className="admin-dashboard-grid">
                <AuditSummary title="Recent CMS changes" rows={recentAuditLogs} />
                <ActionCounts counts={auditActionCounts} />
            </section>
        </>
    );
}

function AuditSummary({ rows, title }: { rows: AuditLogRow[]; title: string }) {
    return (
        <section className="admin-panel">
            <PanelHeader detail={`${rows.length} latest`} meta="Audit" title={title} />
            {rows.length === 0 ? (
                <p className="admin-empty">No audit events yet.</p>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table admin-table-compact">
                        <thead>
                            <tr>
                                <th scope="col">When</th>
                                <th scope="col">Action</th>
                                <th scope="col">Summary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <td>
                                        <time dateTime={row.created_at ?? undefined}>
                                            {formatDateTime(row.created_at)}
                                        </time>
                                    </td>
                                    <td>{row.action_label}</td>
                                    <td>{row.summary}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function ActionCounts({ counts }: { counts: AuditActionCount[] }) {
    return (
        <section className="admin-panel">
            <PanelHeader detail="Top actions" meta="Reporting" title="Audit action counts" />
            {counts.length === 0 ? (
                <p className="admin-empty">No actions recorded.</p>
            ) : (
                <dl className="admin-action-counts">
                    {counts.map((count) => (
                        <div key={count.action}>
                            <dt>{count.label}</dt>
                            <dd>{count.total}</dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
}

function UsersPage({ pagination, users }: { users: AdminUser[]; pagination: Pagination }) {
    const page = useAdminPagination(pagination);

    return (
        <section className="admin-panel">
            <PanelHeader
                detail={page.rangeLabel}
                meta={`${pagination.per_page} per page`}
                title="Registered users"
            />
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Email</th>
                            <th scope="col">Administrator</th>
                            <th scope="col">Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id}>
                                <td>{user.name}</td>
                                <td>{user.email}</td>
                                <td>
                                    <StatusBadge tone={user.is_admin ? 'success' : 'neutral'}>
                                        {user.is_admin ? 'Yes' : 'No'}
                                    </StatusBadge>
                                </td>
                                <td>{formatDate(user.created_at)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <PaginationControls page={page} />
        </section>
    );
}

function renderPagesPage(props: PagesBootstrap['props']) {
    if (props.mode === 'index') {
        return <PageList flash={props.flash} pages={props.pages} />;
    }

    return (
        <PageForm
            action={props.action}
            errors={props.errors}
            flash={props.flash}
            method={props.method}
            page={props.page}
            statusOptions={props.statusOptions}
            token={props.csrfToken}
        />
    );
}

function PageList({ flash, pages }: { flash?: string | null; pages: CmsPageRow[] }) {
    return (
        <section className="admin-panel">
            <PanelHeader
                actionHref="/admin/pages/create"
                actionLabel="New page"
                detail={`${pages.length} total`}
                meta="CMS pages"
                title="Pages"
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Title</th>
                            <th scope="col">Slug</th>
                            <th scope="col">Status</th>
                            <th scope="col">Published</th>
                            <th scope="col">Creator</th>
                            <th scope="col">Updater</th>
                            <th scope="col">Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pages.map((page) => (
                            <tr key={page.id}>
                                <td>{page.title}</td>
                                <td>/pages/{page.slug}</td>
                                <td>
                                    <StatusBadge
                                        tone={page.status === 'published' ? 'success' : 'neutral'}
                                    >
                                        {page.status}
                                    </StatusBadge>
                                </td>
                                <td>{formatDate(page.published_at)}</td>
                                <td>{page.creator_name ?? 'Unknown'}</td>
                                <td>{page.updater_name ?? 'Unknown'}</td>
                                <td>
                                    <a className="admin-table-link" href={page.edit_url}>
                                        Edit
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function PageForm({
    action,
    errors,
    flash,
    method,
    page,
    statusOptions,
    token,
}: {
    action: string;
    errors: ValidationErrors;
    flash?: string | null;
    method: 'POST' | 'PUT';
    page: CmsPageForm;
    statusOptions: string[];
    token: string;
}) {
    const [values, setValues] = useState(page);
    const [submitting, setSubmitting] = useState(false);

    function update(field: keyof CmsPageForm, value: string) {
        setValues((current) => ({ ...current, [field]: value }));
    }

    return (
        <section className="admin-panel admin-form-panel">
            <PanelHeader
                detail="Plain-text CMS content"
                meta={method === 'POST' ? 'Create' : 'Edit'}
                title={method === 'POST' ? 'Create page' : 'Edit page'}
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <form
                action={action}
                className="admin-form"
                method="post"
                onSubmit={() => setSubmitting(true)}
            >
                <input name="_token" type="hidden" value={token} />
                {method === 'PUT' && <input name="_method" type="hidden" value="PUT" />}
                <AdminField
                    error={errors.title?.[0]}
                    label="Title"
                    name="title"
                    onChange={(event) => update('title', event.target.value)}
                    value={values.title}
                />
                <AdminField
                    error={errors.slug?.[0]}
                    label="Slug"
                    name="slug"
                    onChange={(event) => update('slug', event.target.value)}
                    value={values.slug}
                />
                <label className="admin-field">
                    <span>Status</span>
                    <select
                        name="status"
                        onChange={(event) => update('status', event.target.value)}
                        value={values.status}
                    >
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                    <ValidationMessage message={errors.status?.[0]} />
                </label>
                <AdminField
                    error={errors.published_at?.[0]}
                    label="Published at"
                    name="published_at"
                    onChange={(event) => update('published_at', event.target.value)}
                    type="datetime-local"
                    value={values.published_at}
                />
                <AdminTextarea
                    error={errors.body?.[0]}
                    label="Body"
                    name="body"
                    onChange={(event) => update('body', event.target.value)}
                    value={values.body}
                />
                <FormActions backHref="/admin/pages" submitting={submitting} />
            </form>
        </section>
    );
}

function renderFaqsPage(props: FaqsBootstrap['props']) {
    if (props.mode === 'index') {
        return <FaqList faqs={props.faqs} flash={props.flash} />;
    }

    return (
        <FaqForm
            action={props.action}
            errors={props.errors}
            faq={props.faq}
            flash={props.flash}
            method={props.method}
            token={props.csrfToken}
        />
    );
}

function FaqList({ faqs, flash }: { faqs: FaqRow[]; flash?: string | null }) {
    return (
        <section className="admin-panel">
            <PanelHeader
                actionHref="/admin/faqs/create"
                actionLabel="New FAQ"
                detail={`${faqs.length} total`}
                meta="Public FAQ"
                title="FAQs"
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <div className="admin-table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th scope="col">Question</th>
                            <th scope="col">Order</th>
                            <th scope="col">Published</th>
                            <th scope="col">Creator</th>
                            <th scope="col">Updater</th>
                            <th scope="col">Edit</th>
                        </tr>
                    </thead>
                    <tbody>
                        {faqs.map((faq) => (
                            <tr key={faq.id}>
                                <td>{faq.question}</td>
                                <td>{faq.sort_order}</td>
                                <td>
                                    <StatusBadge tone={faq.is_published ? 'success' : 'neutral'}>
                                        {faq.is_published ? 'Yes' : 'No'}
                                    </StatusBadge>
                                </td>
                                <td>{faq.creator_name ?? 'Unknown'}</td>
                                <td>{faq.updater_name ?? 'Unknown'}</td>
                                <td>
                                    <a className="admin-table-link" href={faq.edit_url}>
                                        Edit
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function FaqForm({
    action,
    errors,
    faq,
    flash,
    method,
    token,
}: {
    action: string;
    errors: ValidationErrors;
    faq: FaqForm;
    flash?: string | null;
    method: 'POST' | 'PUT';
    token: string;
}) {
    const [values, setValues] = useState(faq);
    const [submitting, setSubmitting] = useState(false);

    function update(field: keyof FaqForm, value: string | boolean) {
        setValues((current) => ({ ...current, [field]: value }));
    }

    return (
        <section className="admin-panel admin-form-panel">
            <PanelHeader
                detail="Plain-text question and answer"
                meta={method === 'POST' ? 'Create' : 'Edit'}
                title={method === 'POST' ? 'Create FAQ' : 'Edit FAQ'}
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <form
                action={action}
                className="admin-form"
                method="post"
                onSubmit={() => setSubmitting(true)}
            >
                <input name="_token" type="hidden" value={token} />
                {method === 'PUT' && <input name="_method" type="hidden" value="PUT" />}
                <AdminField
                    error={errors.question?.[0]}
                    label="Question"
                    name="question"
                    onChange={(event) => update('question', event.target.value)}
                    value={values.question}
                />
                <AdminTextarea
                    error={errors.answer?.[0]}
                    label="Answer"
                    name="answer"
                    onChange={(event) => update('answer', event.target.value)}
                    value={values.answer}
                />
                <AdminField
                    error={errors.sort_order?.[0]}
                    label="Sort order"
                    min="0"
                    name="sort_order"
                    onChange={(event) => update('sort_order', event.target.value)}
                    type="number"
                    value={values.sort_order}
                />
                <input name="is_published" type="hidden" value="0" />
                <label className="admin-checkbox">
                    <input
                        checked={values.is_published}
                        name="is_published"
                        onChange={(event) => update('is_published', event.target.checked)}
                        type="checkbox"
                        value="1"
                    />
                    <span>Published</span>
                </label>
                <ValidationMessage message={errors.is_published?.[0]} />
                <FormActions backHref="/admin/faqs" submitting={submitting} />
            </form>
        </section>
    );
}

function AuditLogPage({ logs, pagination }: { logs: AuditLogRow[]; pagination: Pagination }) {
    const page = useAdminPagination(pagination);

    return (
        <section className="admin-panel">
            <PanelHeader
                detail={page.rangeLabel}
                meta={`${pagination.per_page} per page`}
                title="Audit events"
            />
            {logs.length === 0 ? (
                <p className="admin-empty">No audit events yet.</p>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Timestamp</th>
                                <th scope="col">Actor</th>
                                <th scope="col">Action</th>
                                <th scope="col">Resource</th>
                                <th scope="col">Summary</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td>
                                        <time dateTime={log.created_at ?? undefined}>
                                            {formatDateTime(log.created_at)}
                                        </time>
                                    </td>
                                    <td>{log.actor_name}</td>
                                    <td>{log.action_label}</td>
                                    <td>
                                        {log.auditable_type ?? 'Unknown'} #
                                        {log.auditable_id ?? 'n/a'}
                                    </td>
                                    <td>{log.summary}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <PaginationControls page={page} />
        </section>
    );
}

function ExportsPage({
    csrfToken,
    exports,
    flash,
    pagination,
    requestAction,
}: {
    csrfToken: string;
    exports: ExportRow[];
    flash?: string | null;
    pagination: Pagination;
    requestAction: string;
}) {
    const page = useAdminPagination(pagination);
    const [submitting, setSubmitting] = useState(false);

    return (
        <section className="admin-panel">
            <PanelHeader
                detail={page.rangeLabel}
                meta={`${pagination.per_page} per page`}
                title="Audit log exports"
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <form
                action={requestAction}
                className="admin-inline-form"
                method="post"
                onSubmit={() => setSubmitting(true)}
            >
                <input name="_token" type="hidden" value={csrfToken} />
                <button className="primary-button" disabled={submitting} type="submit">
                    {submitting ? 'Queueing...' : 'Queue audit export'}
                </button>
                <a className="admin-secondary-link" href="/admin/exports">
                    Refresh
                </a>
            </form>
            {exports.length === 0 ? (
                <p className="admin-empty">No exports requested yet.</p>
            ) : (
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Requested</th>
                                <th scope="col">Type</th>
                                <th scope="col">Status</th>
                                <th scope="col">Completed</th>
                                <th scope="col">Result</th>
                            </tr>
                        </thead>
                        <tbody>
                            {exports.map((item) => (
                                <tr key={item.id}>
                                    <td>{formatDateTime(item.created_at)}</td>
                                    <td>{item.type.replace('_', ' ')}</td>
                                    <td>
                                        <StatusBadge
                                            tone={
                                                item.status === 'completed' ? 'success' : 'neutral'
                                            }
                                        >
                                            {item.status}
                                        </StatusBadge>
                                    </td>
                                    <td>{formatDateTime(item.completed_at)}</td>
                                    <td>
                                        {item.download_url ? (
                                            <a
                                                className="admin-table-link"
                                                href={item.download_url}
                                            >
                                                Download
                                            </a>
                                        ) : (
                                            (item.error_message ?? 'Pending')
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <PaginationControls page={page} />
        </section>
    );
}

function NotificationPreferencesPage({
    action,
    csrfToken,
    errors,
    flash,
    preferences,
}: {
    action: string;
    csrfToken: string;
    errors: ValidationErrors;
    flash?: string | null;
    preferences: NotificationPreferences;
}) {
    const [values, setValues] = useState(preferences);
    const [submitting, setSubmitting] = useState(false);

    function update(field: keyof NotificationPreferences, value: boolean) {
        setValues((current) => ({ ...current, [field]: value }));
    }

    return (
        <section className="admin-panel admin-form-panel">
            <PanelHeader
                detail="Database notifications for CMS publication"
                meta="Account"
                title="Notification preferences"
            />
            {flash && <p className="admin-flash">{flash}</p>}
            <form
                action={action}
                className="admin-form"
                method="post"
                onSubmit={() => setSubmitting(true)}
            >
                <input name="_token" type="hidden" value={csrfToken} />
                <input name="_method" type="hidden" value="PUT" />
                <input name="cms_publication_updates_enabled" type="hidden" value="0" />
                <label className="admin-checkbox">
                    <input
                        checked={values.cms_publication_updates_enabled}
                        name="cms_publication_updates_enabled"
                        onChange={(event) =>
                            update('cms_publication_updates_enabled', event.target.checked)
                        }
                        type="checkbox"
                        value="1"
                    />
                    <span>CMS publication updates</span>
                </label>
                <ValidationMessage message={errors.cms_publication_updates_enabled?.[0]} />
                <input name="database_notifications_enabled" type="hidden" value="0" />
                <label className="admin-checkbox">
                    <input
                        checked={values.database_notifications_enabled}
                        name="database_notifications_enabled"
                        onChange={(event) =>
                            update('database_notifications_enabled', event.target.checked)
                        }
                        type="checkbox"
                        value="1"
                    />
                    <span>Database notifications</span>
                </label>
                <ValidationMessage message={errors.database_notifications_enabled?.[0]} />
                <div className="admin-form-actions">
                    <button className="primary-button" disabled={submitting} type="submit">
                        {submitting ? 'Saving...' : 'Save preferences'}
                    </button>
                </div>
            </form>
        </section>
    );
}
function PanelHeader({
    actionHref,
    actionLabel,
    detail,
    meta,
    title,
}: {
    actionHref?: string;
    actionLabel?: string;
    detail: string;
    meta: string;
    title: string;
}) {
    return (
        <div className="admin-panel-header">
            <div>
                <h2>{title}</h2>
                <p>{detail}</p>
            </div>
            {actionHref && actionLabel ? (
                <a className="admin-public-link" href={actionHref}>
                    {actionLabel}
                </a>
            ) : (
                <span>{meta}</span>
            )}
        </div>
    );
}

function AdminField({
    error,
    label,
    name,
    onChange,
    type = 'text',
    value,
    min,
}: {
    error?: string;
    label: string;
    name: string;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
    type?: string;
    value: string;
    min?: string;
}) {
    return (
        <label className="admin-field">
            <span>{label}</span>
            <input min={min} name={name} onChange={onChange} type={type} value={value} />
            <ValidationMessage message={error} />
        </label>
    );
}

function AdminTextarea({
    error,
    label,
    name,
    onChange,
    value,
}: {
    error?: string;
    label: string;
    name: string;
    onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
    value: string;
}) {
    return (
        <label className="admin-field">
            <span>{label}</span>
            <textarea name={name} onChange={onChange} rows={10} value={value} />
            <ValidationMessage message={error} />
        </label>
    );
}

function ValidationMessage({ message }: { message?: string }) {
    if (!message) {
        return null;
    }

    return <small className="admin-validation">{message}</small>;
}

function StatusBadge({
    children,
    tone,
}: {
    children: React.ReactNode;
    tone: 'neutral' | 'success';
}) {
    return (
        <span className={tone === 'success' ? 'admin-status yes' : 'admin-status'}>{children}</span>
    );
}

function PaginationControls({ page }: { page: ReturnType<typeof useAdminPagination> }) {
    return (
        <nav className="admin-pagination" aria-label="Admin pagination">
            {page.previousUrl ? (
                <a href={page.previousUrl}>Previous</a>
            ) : (
                <span aria-disabled="true">Previous</span>
            )}
            <span>{page.pageLabel}</span>
            {page.nextUrl ? (
                <a href={page.nextUrl}>Next</a>
            ) : (
                <span aria-disabled="true">Next</span>
            )}
        </nav>
    );
}

function FormActions({ backHref, submitting }: { backHref: string; submitting: boolean }) {
    return (
        <div className="admin-form-actions">
            <a className="admin-secondary-link" href={backHref}>
                Cancel
            </a>
            <button className="primary-button" disabled={submitting} type="submit">
                {submitting ? 'Saving...' : 'Save'}
            </button>
        </div>
    );
}

function MissingBootstrap() {
    return (
        <main className="admin-shell admin-missing">
            <section className="state-message error">
                <h1>Admin data unavailable</h1>
                <p>Refresh the page to request the administration payload from Laravel.</p>
            </section>
        </main>
    );
}

const root = document.getElementById('admin-app');

if (root) {
    createRoot(root).render(
        <StrictMode>
            {window.__ADMIN_BOOTSTRAP__ ? (
                <AdminApp bootstrap={window.__ADMIN_BOOTSTRAP__} />
            ) : (
                <MissingBootstrap />
            )}
        </StrictMode>,
    );
}
