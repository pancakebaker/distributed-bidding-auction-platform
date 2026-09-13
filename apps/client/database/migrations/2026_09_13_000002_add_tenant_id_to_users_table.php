<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('users', 'tenant_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->uuid('tenant_id')->nullable()->index();
            });
        }

        $tenantId = trim((string) env('TENANT_ID', 'aaaaaaaa-1111-4111-8111-111111111111'));
        if (! Str::isUuid($tenantId)) {
            throw new RuntimeException('TENANT_ID must be a valid UUID before migrating users.');
        }

        DB::table('users')
            ->whereNull('tenant_id')
            ->update(['tenant_id' => strtolower($tenantId)]);

        Schema::table('users', function (Blueprint $table): void {
            $table->uuid('tenant_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'tenant_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropIndex(['tenant_id']);
                $table->dropColumn('tenant_id');
            });
        }
    }
};
