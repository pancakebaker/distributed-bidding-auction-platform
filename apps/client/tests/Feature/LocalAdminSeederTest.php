<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class LocalAdminSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_local_admin_seeder_requires_explicit_credentials(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Set LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD');

        $this->artisan('db:seed', ['--class' => 'LocalAdminSeeder']);
    }

    public function test_local_admin_seeder_creates_admin_from_environment_values(): void
    {
        config(['app.env' => 'local']);
        putenv('LOCAL_ADMIN_EMAIL=local-admin@example.com');
        putenv('LOCAL_ADMIN_PASSWORD=local-password');
        putenv('LOCAL_ADMIN_NAME=Manual Admin');

        try {
            $this->artisan('db:seed', ['--class' => 'LocalAdminSeeder'])->assertSuccessful();
        } finally {
            putenv('LOCAL_ADMIN_EMAIL');
            putenv('LOCAL_ADMIN_PASSWORD');
            putenv('LOCAL_ADMIN_NAME');
        }

        $admin = User::query()->where('email', 'local-admin@example.com')->firstOrFail();
        $this->assertSame('Manual Admin', $admin->name);
        $this->assertTrue($admin->is_admin);
        $this->assertTrue(password_verify('local-password', $admin->password));
    }
}
