<?php

namespace App\Contracts;

use App\Models\Export;

interface AuditLogExporter
{
    /**
     * Generate an audit-log CSV export and return the stored private path.
     */
    public function export(Export $export): string;
}
