<?php

namespace Database\Factories;

use App\Enums\ExportStatus;
use App\Enums\ExportType;
use App\Models\Export;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Export>
 */
class ExportFactory extends Factory
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
            'type' => ExportType::AuditLogs,
            'status' => ExportStatus::Pending,
            'file_path' => null,
            'error_message' => null,
            'completed_at' => null,
        ];
    }
}
