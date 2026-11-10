<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
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
        // Por IP aunque haya sesión: cada demo es un usuario nuevo, así que contar por usuario no limitaría nada.
        RateLimiter::for('demo', fn (Request $request) => Limit::perHour(5)->by($request->ip()));
    }
}
