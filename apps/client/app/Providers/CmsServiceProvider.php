<?php

namespace App\Providers;

use App\Contracts\AuditLogExporter;
use App\Contracts\CmsCache;
use App\Services\CsvAuditLogExporter;
use App\Services\LaravelCmsCache;
use Illuminate\Support\ServiceProvider;

class CmsServiceProvider extends ServiceProvider
{
    /**
     * Register CMS-specific service bindings.
     */
    public function register(): void
    {
        $this->app->bind(CmsCache::class, LaravelCmsCache::class);
        $this->app->bind(AuditLogExporter::class, CsvAuditLogExporter::class);
    }
}
