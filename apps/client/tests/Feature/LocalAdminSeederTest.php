<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use RuntimeException;
use Tests\TestCase;

class LocalAdminSeederTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Run a seeder assertion with deterministic environment values, regardless
     * of values loaded from a developer's local .env file.
     *
     * @param  array<string, string|null>  $values
     */
    private function withLocalAdminEnvironment(array $values, callable $callback): void
    {
        $names = ['LOCAL_ADMIN_EMAIL', 'LOCAL_ADMIN_PASSWORD', 'LOCAL_ADMIN_NAME'];
        $previous = [];

        foreach ($names as $name) {
            $previous[$name] = [
                'getenv' => getenv($name),
                'env' => array_key_exists($name, $_ENV) ? $_ENV[$name] : null,
                'server' => array_key_exists($name, $_SERVER) ? $_SERVER[$name] : null,
                'env_exists' => array_key_exists($name, $_ENV),
                'server_exists' => array_key_exists($name, $_SERVER),
            ];

            $value = $values[$name] ?? null;

            if ($value === null) {
                putenv($name);
                unset($_ENV[$name], $_SERVER[$name]);
            } else {
                putenv($name.'='.$value);
                $_ENV[$name] = $value;
                $_SERVER[$name] = $value;
            }
        }

        try {
            $callback();
        } finally {
            foreach ($previous as $name => $state) {
                $getenv = $state['getenv'];

                if ($getenv === false) {
                    putenv($name);
                } else {
                    putenv($name.'='.$getenv);
                }

                if ($state['env_exists']) {
                    $_ENV[$name] = $state['env'];
                } else {
                    unset($_ENV[$name]);
                }

                if ($state['server_exists']) {
                    $_SERVER[$name] = $state['server'];
                } else {
                    unset($_SERVER[$name]);
                }
            }
        }
    }

    public function test_local_admin_seeder_requires_explicit_credentials(): void
    {
        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Set LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD');

        $this->withLocalAdminEnvironment([], function (): void {
            $this->artisan('db:seed', ['--class' => 'LocalAdminSeeder']);
        });
    }

    public function test_local_admin_seeder_creates_admin_from_environment_values(): void
    {
        config(['app.env' => 'local']);

        $this->withLocalAdminEnvironment([
            'LOCAL_ADMIN_EMAIL' => 'local-admin@example.com',
            'LOCAL_ADMIN_PASSWORD' => 'local-password',
            'LOCAL_ADMIN_NAME' => 'Manual Admin',
        ], function (): void {
            $this->artisan('db:seed', ['--class' => 'LocalAdminSeeder'])->assertSuccessful();
        });

        $admin = User::query()->where('email', 'local-admin@example.com')->firstOrFail();
        $this->assertSame('Manual Admin', $admin->name);
        $this->assertTrue($admin->is_admin);
        $this->assertTrue(password_verify('local-password', $admin->password));
    }
}
