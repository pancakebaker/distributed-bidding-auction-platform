<?php

namespace App\Providers;

use App\Contracts\CmsCache;
use App\Models\User;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::define('access-admin', fn (User $user): bool => (bool) $user->is_admin);

        View::composer(['welcome', 'cms'], function ($view): void {
            $view->with('publicNavigationPages', app(CmsCache::class)->getPublicNavigationPages());
        });
    }
}
