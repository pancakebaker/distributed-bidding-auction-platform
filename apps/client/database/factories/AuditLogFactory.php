<?php

namespace Database\Factories;

use App\Models\AuditLog;
use App\Models\Page;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AuditLog>
 */
class AuditLogFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'action' => 'page.updated',
            'auditable_type' => Page::class,
            'auditable_id' => 1,
            'metadata' => [
                'title' => $this->faker->sentence(3),
                'slug' => $this->faker->slug(),
                'status' => 'published',
            ],
        ];
    }
}
