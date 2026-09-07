<?php

namespace Database\Factories;

use App\Models\Faq;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Faq>
 */
class FaqFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'question' => fake()->unique()->sentence().'?',
            'answer' => fake()->paragraph(),
            'sort_order' => fake()->numberBetween(0, 100),
            'is_published' => false,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }

    /**
     * Indicate that the FAQ is publicly visible.
     */
    public function published(): static
    {
        return $this->state(fn (array $attributes) => [
            'is_published' => true,
        ]);
    }
}
