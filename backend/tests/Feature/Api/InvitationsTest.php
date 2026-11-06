<?php

use App\Models\Invitation;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('requires authentication', function () {
    $this->getJson('/api/invitations')->assertUnauthorized();
    $this->postJson('/api/invitations')->assertUnauthorized();
});

it('creates a one-week invitation and stores only the token hash', function () {
    $this->freezeSecond();

    $response = $this->actingAs($this->user)->postJson('/api/invitations')
        ->assertCreated()
        ->assertJsonStructure(['data' => ['id', 'expires_at', 'expires_on', 'token']]);

    $token = $response->json('data.token');
    $invitation = Invitation::withoutGlobalScopes()->sole();

    expect($token)->toHaveLength(40)
        ->and($invitation->token_hash)->toBe(hash('sha256', $token))
        ->and($invitation->user_id)->toBe($this->user->id)
        ->and($invitation->expires_at->equalTo(now()->addDays(7)))->toBeTrue()
        ->and(json_encode($invitation->getAttributes()))->not->toContain($token);
});

it('lists only the user pending invitations, newest first', function () {
    $old = Invitation::factory()->for($this->user)->create();
    $new = Invitation::factory()->for($this->user)->create();
    Invitation::factory()->for($this->user)->expired()->create();
    Invitation::factory()->for($this->user)->accepted()->create();
    Invitation::factory()->create();

    $this->actingAs($this->user)->getJson('/api/invitations')
        ->assertOk()
        ->assertJsonPath('data.*.id', [$new->id, $old->id])
        ->assertJsonMissingPath('data.0.token');
});

it('allows at most five pending invitations', function () {
    Invitation::factory()->count(5)->for($this->user)->create();
    Invitation::factory()->for($this->user)->expired()->create();

    $this->actingAs($this->user)->postJson('/api/invitations')
        ->assertStatus(422)
        ->assertJsonPath('errors.invitation.0', 'Tienes 5 invitaciones pendientes. Anula una para crear otra.');
});

it('revokes only own invitations', function () {
    $mine = Invitation::factory()->for($this->user)->create();
    $other = Invitation::factory()->create();

    $this->actingAs($this->user);
    $this->deleteJson("/api/invitations/{$other->id}")->assertNotFound();
    $this->deleteJson("/api/invitations/{$mine->id}")->assertNoContent();

    expect(Invitation::withoutGlobalScopes()->pluck('id')->all())->toBe([$other->id]);
});
