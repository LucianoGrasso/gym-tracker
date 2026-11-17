<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** Token del Atajo de iOS "GymTracker Salud": uno por usuario, solo para /api/health-sync. */
class HealthTokenController extends Controller
{
    public const NAME = 'health-shortcut';

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_if($user->isDemo(), 403, 'La demo no puede conectar Salud.');

        $user->tokens()->where('name', self::NAME)->delete();
        $token = $user->createToken(self::NAME, ['health:sync'])->plainTextToken;

        return response()->json(['data' => ['token' => $token]], 201);
    }

    public function destroy(Request $request): Response
    {
        $request->user()->tokens()->where('name', self::NAME)->delete();

        return response()->noContent();
    }
}
