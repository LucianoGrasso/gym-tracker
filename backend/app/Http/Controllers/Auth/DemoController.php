<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Services\Demo\CreateDemoAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class DemoController extends Controller
{
    public function store(Request $request, CreateDemoAccount $demo): JsonResponse
    {
        // Una demo nueva reemplaza cualquier sesión abierta (si no, el scope por usuario apuntaría a la anterior).
        Auth::guard('web')->logout();
        $demo->purgeExpired();
        abort_if($demo->isFull(), 503, 'La demo está llena. Intenta en un rato.');

        $user = $demo->create();
        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        return (new UserResource($user))->response()->setStatusCode(201);
    }
}
