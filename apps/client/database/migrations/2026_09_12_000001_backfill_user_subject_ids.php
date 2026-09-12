<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    /**
     * Backfill stable opaque subjects for users created before AUTH1.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'subject_id')) {
            Schema::table('users', function ($table): void {
                $table->uuid('subject_id')->nullable()->unique();
            });
        }

        DB::table('users')
            ->whereNull('subject_id')
            ->orderBy('id')
            ->eachById(function (object $user): void {
                DB::table('users')
                    ->where('id', $user->id)
                    ->update(['subject_id' => (string) Str::uuid()]);
            });
    }

    /**
     * Subject identifiers are intentionally not removed on rollback.
     */
    public function down(): void
    {
        // Stable subjects are identity data and are retained on rollback.
    }
};
