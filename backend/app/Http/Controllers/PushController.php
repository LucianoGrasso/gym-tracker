<?php

namespace App\Http\Controllers;

use App\Http\Requests\PushTokenRequest;
use App\Services\Push\PushSigner;
use Illuminate\Http\JsonResponse;

class PushController extends Controller
{
    public function config(): JsonResponse
    {
        return response()->json(['data' => ['public_key' => config('services.push.vapid_public_key')]]);
    }

    public function token(PushTokenRequest $request, PushSigner $signer): JsonResponse
    {
        return response()->json(['data' => ['signature' => $signer->sign($request->validated('endpoint'))]]);
    }
}
