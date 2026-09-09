import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { AdminApp, useAdminPagination } from './AdminApp';

const navigation = [
    { label: 'Dashboard', href: '/admin', active: false },
    { label: 'Users', href: '/admin/users', active: false },
    { label: 'Pages', href: '/admin/pages', active: false },
    { label: 'FAQs', href: '/admin/faqs', active: false },
    { label: 'Audit Log', href: '/admin/audit-logs', active: false },
    { label: 'Exports', href: '/admin/exports', active: false },
];

const externalNavigation = [
    ...navigation,
    {
        label: 'Live Feed Operations ↗',
        href: '/admin/live-feed',
        active: false,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
    {
        label: 'Auction Operations ↗',
        href: '/admin/auction-operations',
        active: false,
        target: '_blank',
        rel: 'noopener noreferrer',
    },
];

const pagination = {
    current_page: 1,
    last_page: 2,
    per_page: 20,
    total: 21,
    from: 1,
    to: 20,
    prev_page_url: null,
    next_page_url: '/admin/users?page=2',
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });

    return { promise, reject, resolve };
}

describe('admin UI', () => {
    beforeEach(() => {
        window.history.replaceState({}, '', '/admin');
    });

    it('renders external operations launchers without intercepting their handoff routes', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation: externalNavigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        for (const label of ['Live Feed Operations ↗', 'Auction Operations ↗']) {
            const link = screen.getByRole('link', { name: label });
            expect(link).toHaveAttribute('target', '_blank');
            expect(link).toHaveAttribute('rel', 'noopener noreferrer');
            fireEvent.click(link);
        }

        expect(fetchMock).not.toHaveBeenCalled();
    });

    afterEach(() => {
        cleanup();
        vi.unstubAllGlobals();
    });

    it('renders dashboard metrics, audit summaries, and CMS navigation', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Dashboard' })),
                    props: {
                        metrics: [
                            { label: 'Total users', value: 12 },
                            { label: 'Published pages', value: 2 },
                            { label: 'Audit events today', value: 1 },
                        ],
                        recentAuditLogs: [
                            {
                                id: 1,
                                created_at: '2026-09-06T00:00:00+00:00',
                                actor_name: 'Ada Admin',
                                action: 'page.updated',
                                action_label: 'Page Updated',
                                auditable_type: 'Page',
                                auditable_id: 1,
                                summary: 'About',
                            },
                        ],
                        auditActionCounts: [{ action: 'page.updated', label: 'Page Updated', total: 3 }],
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Pages' })).toHaveAttribute('href', '/admin/pages');
        expect(screen.getByRole('link', { name: 'FAQs' })).toHaveAttribute('href', '/admin/faqs');
        expect(screen.getByRole('link', { name: 'Audit Log' })).toHaveAttribute('href', '/admin/audit-logs');
        expect(screen.getByText('Recent CMS changes')).toBeInTheDocument();
        expect(screen.getAllByText('Page Updated')[0]).toBeInTheDocument();
    });

    it('renders paginated users from Laravel bootstrap data', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'users',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Users' })),
                    props: {
                        users: [
                            {
                                id: 1,
                                name: 'Admin User',
                                email: 'admin@example.com',
                                is_admin: true,
                                created_at: '2026-09-06T00:00:00+00:00',
                            },
                        ],
                        pagination,
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Admin User' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/admin/users?page=2');
    });

    it('renders page list rows with creator and updater names', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'pages',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Pages' })),
                    props: {
                        mode: 'index',
                        pages: [
                            {
                                id: 1,
                                slug: 'about',
                                title: 'About',
                                status: 'published',
                                published_at: '2026-09-06T00:00:00+00:00',
                                creator_name: 'Ada Admin',
                                updater_name: 'Uma Updater',
                                edit_url: '/admin/pages/about/edit',
                                public_url: '/pages/about',
                            },
                        ],
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { level: 1, name: 'Pages' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'About' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Ada Admin' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/admin/pages/about/edit');
    });

    it('renders page form validation errors and pending submit state', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'pages',
                    navigation,
                    props: {
                        mode: 'create',
                        action: '/admin/pages',
                        method: 'POST',
                        csrfToken: 'token',
                        statusOptions: ['draft', 'published'],
                        errors: { title: ['The title field is required.'] },
                        page: { id: null, title: '', slug: '', body: '', status: 'draft', published_at: '' },
                    },
                }}
            />,
        );

        expect(screen.getByText('The title field is required.')).toBeInTheDocument();
        fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form')!);
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });

    it('renders FAQ list rows', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'faqs',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'FAQs' })),
                    props: {
                        mode: 'index',
                        faqs: [
                            {
                                id: 1,
                                question: 'How do I bid?',
                                sort_order: 1,
                                is_published: true,
                                creator_name: 'Ada Admin',
                                updater_name: 'Ada Admin',
                                edit_url: '/admin/faqs/1/edit',
                            },
                        ],
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { level: 1, name: 'FAQs' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'How do I bid?' })).toBeInTheDocument();
    });

    it('renders existing FAQ form values when editing', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'faqs',
                    navigation,
                    props: {
                        mode: 'edit',
                        action: '/admin/faqs/1',
                        method: 'PUT',
                        csrfToken: 'token',
                        errors: {},
                        faq: {
                            id: 1,
                            question: 'Can I cancel a bid?',
                            answer: 'Accepted bids are authoritative in the bidding service.',
                            sort_order: '3',
                            is_published: true,
                        },
                    },
                }}
            />,
        );

        expect(screen.getByDisplayValue('Can I cancel a bid?')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Accepted bids are authoritative in the bidding service.')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Published' })).toBeChecked();
    });

    it('renders audit log rows with safe summaries and pagination', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'audit-logs',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Audit Log' })),
                    props: {
                        logs: [
                            {
                                id: 1,
                                created_at: '2026-09-06T00:00:00+00:00',
                                actor_name: 'Ada Admin',
                                action: 'faq.updated',
                                action_label: 'Faq Updated',
                                auditable_type: 'FAQ',
                                auditable_id: 7,
                                summary: 'Can I bid?',
                            },
                        ],
                        pagination: { ...pagination, next_page_url: '/admin/audit-logs?page=2' },
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Ada Admin' })).toBeInTheDocument();
        expect(screen.getByRole('cell', { name: 'Can I bid?' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/admin/audit-logs?page=2');
    });

    it('renders an empty audit state', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'audit-logs',
                    navigation,
                    props: {
                        logs: [],
                        pagination: {
                            ...pagination,
                            total: 0,
                            from: null,
                            to: null,
                            last_page: 1,
                            next_page_url: null,
                        },
                    },
                }}
            />,
        );

        expect(screen.getByText('No audit events yet.')).toBeInTheDocument();
    });

    it('derives shared pagination labels with the custom hook', () => {
        const { result } = renderHook(() => useAdminPagination(pagination));

        expect(result.current.rangeLabel).toBe('Showing 1-20 of 21');
        expect(result.current.pageLabel).toBe('Page 1 of 2');
        expect(result.current.nextUrl).toBe('/admin/users?page=2');
    });
    it('renders export status rows and queues exports with pending state', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'exports',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Exports' })),
                    props: {
                        requestAction: '/admin/audit-logs/export',
                        csrfToken: 'token',
                        exports: [
                            {
                                id: 1,
                                type: 'audit_logs',
                                status: 'completed',
                                created_at: '2026-09-06T00:00:00+00:00',
                                completed_at: '2026-09-06T00:01:00+00:00',
                                error_message: null,
                                download_url: '/admin/exports/1/download',
                            },
                        ],
                        pagination: { ...pagination, next_page_url: null },
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Exports' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', '/admin/exports/1/download');
        fireEvent.submit(screen.getByRole('button', { name: 'Queue audit export' }).closest('form')!);
        expect(screen.getByRole('button', { name: 'Queueing...' })).toBeDisabled();
    });

    it('renders an empty exports state', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'exports',
                    navigation,
                    props: {
                        requestAction: '/admin/audit-logs/export',
                        csrfToken: 'token',
                        exports: [],
                        pagination: {
                            ...pagination,
                            total: 0,
                            from: null,
                            to: null,
                            last_page: 1,
                            next_page_url: null,
                        },
                    },
                }}
            />,
        );

        expect(screen.getByText('No exports requested yet.')).toBeInTheDocument();
    });

    it('renders notification preferences as controlled account settings', () => {
        render(
            <AdminApp
                bootstrap={{
                    page: 'notification-preferences',
                    navigation: [],
                    props: {
                        action: '/account/notifications',
                        csrfToken: 'token',
                        errors: {},
                        preferences: {
                            cms_publication_updates_enabled: true,
                            database_notifications_enabled: false,
                        },
                    },
                }}
            />,
        );

        expect(screen.getByRole('heading', { name: 'Notification Preferences' })).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'CMS publication updates' })).toBeChecked();
        expect(screen.getByRole('checkbox', { name: 'Database notifications' })).not.toBeChecked();
    });

    it('loads internal admin links through JSON without remounting the shell', async () => {
        const nextBootstrap = {
            page: 'pages' as const,
            navigation: navigation.map((item) => ({ ...item, active: item.label === 'Pages' })),
            props: {
                mode: 'index' as const,
                pages: [
                    {
                        id: 1,
                        slug: 'about',
                        title: 'About',
                        status: 'published',
                        published_at: '2026-09-06T00:00:00+00:00',
                        creator_name: 'Ada Admin',
                        updater_name: 'Ada Admin',
                        edit_url: '/admin/pages/1/edit',
                        public_url: '/pages/about',
                    },
                ],
            },
        };
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () => Promise.resolve(nextBootstrap),
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Dashboard' })),
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        const shell = screen.getByLabelText('Admin content');
        fireEvent.click(screen.getByRole('link', { name: 'Pages' }));

        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pages' })).toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/admin/pages'),
            expect.objectContaining({ credentials: 'same-origin' }),
        );
        expect(window.location.pathname).toBe('/admin/pages');
        expect(screen.getByLabelText('Admin content')).toBe(shell);
    });

    it('keeps the old page visible with a compact loading status until the next payload is ready', async () => {
        const response = deferred<Response>();
        const fetchMock = vi.fn().mockReturnValue(response.promise);
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Dashboard' })),
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Pages' }));

        expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
        expect(screen.getByRole('status', { name: 'Loading admin page' })).toBeInTheDocument();
        expect(screen.queryByText('Loading admin page...', { selector: 'p' })).not.toBeInTheDocument();

        response.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ page: 'pages', navigation, props: { mode: 'index', pages: [] } }),
        } as Response);

        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Pages' })).toBeInTheDocument());
        expect(screen.queryByRole('status', { name: 'Loading admin page' })).not.toBeInTheDocument();
    });

    it('keeps the old page visible when navigation fails', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('network unavailable'));
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Pages' }));

        await waitFor(() =>
            expect(screen.getByRole('heading', { name: 'Admin page unavailable' })).toBeInTheDocument(),
        );
        expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    });

    it('does not let a stale navigation response replace a newer page', async () => {
        const firstResponse = deferred<Response>();
        const secondResponse = deferred<Response>();
        const fetchMock = vi
            .fn()
            .mockReturnValueOnce(firstResponse.promise)
            .mockReturnValueOnce(secondResponse.promise);
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        fireEvent.click(screen.getByRole('link', { name: 'Pages' }));
        fireEvent.click(screen.getByRole('link', { name: 'Users' }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

        firstResponse.resolve({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    page: 'pages',
                    navigation,
                    props: { mode: 'index', pages: [] },
                }),
        } as Response);
        secondResponse.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ page: 'users', navigation, props: { users: [], pagination } }),
        } as Response);

        await waitFor(() => expect(screen.getByRole('heading', { name: 'Users' })).toBeInTheDocument());
        expect(screen.queryByRole('heading', { name: 'Pages' })).not.toBeInTheDocument();
    });
    it('updates admin content when browser history emits popstate', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: () =>
                Promise.resolve({
                    page: 'users',
                    navigation: navigation.map((item) => ({ ...item, active: item.label === 'Users' })),
                    props: { users: [], pagination },
                }),
        });
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        window.history.pushState({}, '', '/admin/users');
        window.dispatchEvent(new PopStateEvent('popstate'));

        await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument());
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('/admin/users'),
            expect.objectContaining({ credentials: 'same-origin' }),
        );
    });

    it('does not intercept modified admin link clicks', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        const pagesLink = screen.getByRole('link', { name: 'Pages' });
        pagesLink.addEventListener('click', (event) => event.preventDefault());

        fireEvent.click(pagesLink, { ctrlKey: true });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(window.location.pathname).toBe('/admin');
    });

    it('does not intercept non-admin links', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        render(
            <AdminApp
                bootstrap={{
                    page: 'dashboard',
                    navigation,
                    props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                }}
            />,
        );

        const link = screen.getByRole('link', { name: 'View auctions' });
        link.addEventListener('click', (event) => event.preventDefault());
        fireEvent.click(link);
        expect(fetchMock).not.toHaveBeenCalled();
    });
    it('cleans up navigation listeners under Strict Mode', () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        const { unmount } = render(
            <React.StrictMode>
                <AdminApp
                    bootstrap={{
                        page: 'dashboard',
                        navigation,
                        props: { metrics: [], recentAuditLogs: [], auditActionCounts: [] },
                    }}
                />
            </React.StrictMode>,
        );

        unmount();
        window.dispatchEvent(new PopStateEvent('popstate'));

        expect(fetchMock).not.toHaveBeenCalled();
    });
});
