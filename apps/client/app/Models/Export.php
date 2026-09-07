<?php

namespace App\Models;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use Database\Factories\ExportFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['user_id', 'type', 'status', 'file_path', 'error_message', 'completed_at'])]
class Export extends Model
{
    /** @use HasFactory<ExportFactory> */
    use HasFactory;

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'completed_at' => 'datetime',
            'status' => ExportStatus::class,
            'type' => ExportType::class,
        ];
    }

    /**
     * Get the user who requested the export.
     *
     * @return BelongsTo<User, Export>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
