<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database with deterministic local/demo content.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        $this->call([
            DemoAdminSeeder::class,
            LocalBidderSeeder::class,
            PageSeeder::class,
            FaqSeeder::class,
        ]);

        if (filled(env('LOCAL_ADMIN_EMAIL')) && filled(env('LOCAL_ADMIN_PASSWORD'))) {
            $this->call(LocalAdminSeeder::class);
        }
    }
}
