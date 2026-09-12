<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class LocalBidderSeeder extends Seeder
{
    public const DEFAULT_PASSWORD = 'bidder-password';

    /**
     * Create deterministic non-admin bidder accounts for local/demo use.
     */
    public function run(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('LocalBidderSeeder may only run in the local or testing environment.');
        }

        $password = (string) env('DEMO_BIDDER_PASSWORD', self::DEFAULT_PASSWORD);

        foreach ([
            ['email' => 'bidder1@example.test', 'name' => 'Bidder One'],
            ['email' => 'bidder2@example.test', 'name' => 'Bidder Two'],
            ['email' => 'bidder3@example.test', 'name' => 'Bidder Three'],
        ] as $bidder) {
            $user = User::query()->firstOrNew(['email' => $bidder['email']]);
            $user->forceFill([
                'name' => $bidder['name'],
                'password' => Hash::make($password),
                'is_admin' => false,
                'subject_id' => $user->subject_id ?: (string) Str::uuid(),
            ])->save();
        }
    }
}
