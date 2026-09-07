<?php

namespace App\Enums;

enum PageStatus: string
{
    case Draft = 'draft';
    case Published = 'published';

    /**
     * Return values accepted by page validation rules.
     *
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(fn (self $status): string => $status->value, self::cases());
    }
}
