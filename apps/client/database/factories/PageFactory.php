<?php

namespace Database\Factories;

use App\Enums\PageStatus;
use App\Models\Page;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Page>
 */
class PageFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $title = fake()->unique()->sentence(3);

        return [
            'slug' => Str::slug($title),
            'title' => $title,
            'body' => fake()->paragraphs(3, true),
            'status' => PageStatus::Draft,
            'published_at' => null,
            'created_by' => User::factory(),
            'updated_by' => User::factory(),
        ];
    }

    /**
     * Indicate that the page is publicly visible.
     */
    public function published(): static
    {
        return $this->state(fn (array $attributes) => [
            'status' => PageStatus::Published,
            'published_at' => now()->subMinute(),
        ]);
    }
}
