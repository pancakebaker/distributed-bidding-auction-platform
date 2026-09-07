<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use RuntimeException;

class LocalAdminSeeder extends Seeder
{
    /**
     * Create or update a local administrator from explicit environment values.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('LocalAdminSeeder may only run in the local or testing environment.');
        }

        $email = env('LOCAL_ADMIN_EMAIL');
        $password = env('LOCAL_ADMIN_PASSWORD');

        if (! is_string($email) || $email === '' || ! is_string($password) || $password === '') {
            throw new RuntimeException('Set LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD before running LocalAdminSeeder.');
        }

        User::query()->updateOrCreate(
            ['email' => $email],
            [
                'name' => env('LOCAL_ADMIN_NAME', 'Local Admin'),
                'password' => Hash::make($password),
                'is_admin' => true,
            ],
        );
    }
}
