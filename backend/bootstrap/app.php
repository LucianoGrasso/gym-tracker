<?php

use App\Http\Middleware\EnsureDemoActive;
use App\Http\Middleware\RejectPersonalAccessTokens;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Laravel\Sanctum\Http\Middleware\CheckAbilities;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->alias([
            'demo.active' => EnsureDemoActive::class,
            'spa.only' => RejectPersonalAccessTokens::class,
            'abilities' => CheckAbilities::class,
        ]);
        $middleware->redirectGuestsTo(
            fn (Request $request) => $request->is('api/*', 'auth/*') ? null : '/login',
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*', 'auth/*') || $request->expectsJson(),
        );
    })->create();
