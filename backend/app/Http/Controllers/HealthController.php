<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Throwable;

class HealthController extends Controller
{
    /**
     * Touches the database so that a paused Aurora instance starts resuming.
     */
    public function __invoke(): JsonResponse
    {
        try {
            DB::select('select 1');
        } catch (Throwable) {
            return response()->json(['status' => 'unavailable'], 503);
        }

        return response()->json(['status' => 'ok']);
    }
}
