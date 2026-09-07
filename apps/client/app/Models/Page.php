<?php

namespace App\Models;

use App\Enums\PageStatus;
use Database\Factories\PageFactory;
use Illuminate\Database\Eloquent\Attributes\Scope;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Page extends Model
{
    /** @use HasFactory<PageFactory> */
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'slug',
        'title',
        'body',
        'status',
        'published_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'status' => PageStatus::class,
        ];
    }

    /**
     * Limit the query to pages visible on the public site.
     *
     * @param  Builder<Page>  $query
     */
    #[Scope]
    protected function published(Builder $query): void
    {
        $query->where('status', PageStatus::Published->value)
            ->where(function (Builder $query): void {
                $query->whereNull('published_at')
                    ->orWhere('published_at', '<=', now());
            });
    }

    /**
     * Determine whether the page is visible on public routes.
     */
    public function isPubliclyVisible(): bool
    {
        return $this->status === PageStatus::Published
            && ($this->published_at === null || $this->published_at->isPast() || $this->published_at->isCurrentSecond());
    }

    /**
     * Get the user who created the page.
     *
     * @return BelongsTo<User, Page>
     */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /**
     * Get the user who last updated the page.
     *
     * @return BelongsTo<User, Page>
     */
    public function updater(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
