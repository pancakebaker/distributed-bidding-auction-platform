<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class DemoAdminSeeder extends Seeder
{
    public const DEFAULT_EMAIL = 'admin@example.test';

    public const DEFAULT_NAME = 'Demo Admin';

    public const DEFAULT_PASSWORD = 'password';

    /**
     * Create or update a deterministic development administrator for local demos.
     */
    public function run(): void
    {
        $user = User::query()->firstOrNew([
            'email' => env('DEMO_ADMIN_EMAIL', self::DEFAULT_EMAIL),
        ]);

        $user->fill([
            'name' => env('DEMO_ADMIN_NAME', self::DEFAULT_NAME),
            'password' => env('DEMO_ADMIN_PASSWORD', self::DEFAULT_PASSWORD),
        ]);

        $user->forceFill(['is_admin' => true])->save();
    }
}
