<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

#[Fillable(['name', 'email', 'password'])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected static function booted(): void
    {
        static::creating(function (User $user): void {
            $user->subject_id ??= (string) Str::uuid();
        });
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'is_admin' => 'boolean',
            'password' => 'hashed',
        ];
    }

    /**
     * Get the stable opaque subject used in trusted service tokens.
     */
    public function getSubjectId(): string
    {
        if (! is_string($this->subject_id) || $this->subject_id === '') {
            throw new \LogicException('User subject_id is not initialized.');
        }

        return $this->subject_id;
    }

    /**
     * Get pages created by the user.
     *
     * @return HasMany<Page, User>
     */
    public function createdPages(): HasMany
    {
        return $this->hasMany(Page::class, 'created_by');
    }

    /**
     * Get pages last updated by the user.
     *
     * @return HasMany<Page, User>
     */
    public function updatedPages(): HasMany
    {
        return $this->hasMany(Page::class, 'updated_by');
    }

    /**
     * Get FAQs created by the user.
     *
     * @return HasMany<Faq, User>
     */
    public function createdFaqs(): HasMany
    {
        return $this->hasMany(Faq::class, 'created_by');
    }

    /**
     * Get FAQs last updated by the user.
     *
     * @return HasMany<Faq, User>
     */
    public function updatedFaqs(): HasMany
    {
        return $this->hasMany(Faq::class, 'updated_by');
    }

    /**
     * Get the user's notification preferences.
     *
     * @return HasOne<NotificationPreference, User>
     */
    public function notificationPreference(): HasOne
    {
        return $this->hasOne(NotificationPreference::class);
    }

    /**
     * Get exports requested by the user.
     *
     * @return HasMany<Export, User>
     */
    public function exports(): HasMany
    {
        return $this->hasMany(Export::class);
    }
}
