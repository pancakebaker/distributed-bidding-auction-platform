<?php

namespace App\Models;

use Database\Factories\NotificationPreferenceFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'cms_publication_updates_enabled', 'database_notifications_enabled'])]
class NotificationPreference extends Model
{
    /** @use HasFactory<NotificationPreferenceFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'cms_publication_updates_enabled' => 'boolean',
            'database_notifications_enabled' => 'boolean',
        ];
    }

    /**
     * Get the user who owns these preferences.
     *
     * @return BelongsTo<User, NotificationPreference>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
