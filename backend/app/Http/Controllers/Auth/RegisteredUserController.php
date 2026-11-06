<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Resources\UserResource;
use App\Services\Invitations\AcceptInvitation;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class RegisteredUserController extends Controller
{
    public function store(RegisterRequest $request, AcceptInvitation $accept): JsonResponse
    {
        $user = $accept->handle($request->validated('token'), $request->safe()->only(['name', 'email', 'password']));

        Auth::guard('web')->login($user, remember: true);
        $request->session()->regenerate();

        return (new UserResource($user))->response()->setStatusCode(201);
    }
}
