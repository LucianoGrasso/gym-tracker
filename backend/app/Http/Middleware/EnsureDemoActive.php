<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/** Una demo vencida pierde la sesión: 401 como cualquier sesión cerrada. */
class EnsureDemoActive
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user?->isDemo() && $user->demo_expires_at->isPast()) {
            Auth::guard('web')->logout();
            if ($request->hasSession()) {
                $request->session()->invalidate();
            }

            return response()->json(['message' => 'La demo terminó.'], 401);
        }

        return $next($request);
    }
}
