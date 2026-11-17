<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/** Los tokens personales (Atajo de Salud) solo sirven en /api/health-sync; el resto es de la SPA. */
class RejectPersonalAccessTokens
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->currentAccessToken() instanceof PersonalAccessToken) {
            return response()->json(['message' => 'Este token solo sirve para sincronizar datos de salud.'], 403);
        }

        return $next($request);
    }
}
