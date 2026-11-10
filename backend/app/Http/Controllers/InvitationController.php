<?php

namespace App\Http\Controllers;

use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use App\Services\Invitations\CreateInvitation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

class InvitationController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return InvitationResource::collection(Invitation::query()->pending()->latest('id')->get());
    }

    public function store(Request $request, CreateInvitation $create): JsonResponse
    {
        abort_if($request->user()->isDemo(), 403, 'La demo no puede invitar.');
        ['invitation' => $invitation, 'token' => $token] = $create->handle($request->user());

        return response()->json([
            'data' => (new InvitationResource($invitation))->resolve($request) + ['token' => $token],
        ], 201);
    }

    /** El global scope de BelongsToUser hace que una invitación ajena dé 404. */
    public function destroy(Invitation $invitation): Response
    {
        $invitation->delete();

        return response()->noContent();
    }
}
