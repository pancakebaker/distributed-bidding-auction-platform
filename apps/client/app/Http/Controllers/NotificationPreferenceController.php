<?php

namespace App\Http\Controllers;

use App\Http\Requests\UpdateNotificationPreferenceRequest;
use App\Models\NotificationPreference;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class NotificationPreferenceController extends Controller
{
    /**
     * Show the authenticated user notification preferences.
     */
    public function edit(Request $request): View
    {
        $preferences = $this->preferencesFor($request);

        return view('admin', [
            'adminBootstrap' => [
                'page' => 'notification-preferences',
                'navigation' => [],
                'props' => [
                    'action' => route('account.notifications.update'),
                    'csrfToken' => (string) $request->session()->token(),
                    'flash' => session('status'),
                    'errors' => session('errors')?->getBag('default')->toArray() ?? [],
                    'preferences' => [
                        'cms_publication_updates_enabled' => (bool) old('cms_publication_updates_enabled', $preferences->cms_publication_updates_enabled),
                        'database_notifications_enabled' => (bool) old('database_notifications_enabled', $preferences->database_notifications_enabled),
                    ],
                ],
            ],
        ]);
    }

    /**
     * Update the authenticated user notification preferences.
     */
    public function update(UpdateNotificationPreferenceRequest $request): RedirectResponse
    {
        $this->preferencesFor($request)->forceFill($request->validated())->save();

        return redirect()
            ->route('account.notifications.edit')
            ->with('status', 'Notification preferences saved.');
    }

    /**
     * Get or create the authenticated user preference row.
     */
    private function preferencesFor(Request $request): NotificationPreference
    {
        return NotificationPreference::query()->firstOrCreate(
            ['user_id' => $request->user()->id],
            [
                'cms_publication_updates_enabled' => true,
                'database_notifications_enabled' => true,
            ],
        );
    }
}
