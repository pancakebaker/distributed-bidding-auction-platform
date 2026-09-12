<?php

namespace App\Support;

class AdminNavigation
{
    /**
     * Build the implemented admin navigation links for the React shell.
     *
     * @return array<int, array{label: string, href: string, active: bool, target?: string, rel?: string}>
     */
    public static function for(string $activePage): array
    {
        return [
            ['label' => 'Dashboard', 'href' => route('admin.dashboard'), 'active' => $activePage === 'dashboard'],
            ['label' => 'Users', 'href' => route('admin.users.index'), 'active' => $activePage === 'users'],
            ['label' => 'Pages', 'href' => route('admin.pages.index'), 'active' => $activePage === 'pages'],
            ['label' => 'FAQs', 'href' => route('admin.faqs.index'), 'active' => $activePage === 'faqs'],
            ['label' => 'Audit Log', 'href' => route('admin.audit-logs.index'), 'active' => $activePage === 'audit-logs'],
            ['label' => 'Exports', 'href' => route('admin.exports.index'), 'active' => $activePage === 'exports'],
            ['label' => 'Auction Management', 'href' => route('admin.auctions'), 'active' => $activePage === 'auctions'],
            [
                'label' => 'Live Feed Operations ↗',
                'href' => route('admin.live-feed'),
                'active' => false,
                'target' => '_blank',
                'rel' => 'noopener noreferrer',
            ],
            [
                'label' => 'Auction Operations ↗',
                'href' => route('admin.auction-operations'),
                'active' => false,
                'target' => '_blank',
                'rel' => 'noopener noreferrer',
            ],
        ];
    }
}
