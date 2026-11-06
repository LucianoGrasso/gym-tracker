<?php

use App\Models\Exercise;
use App\Models\Invitation;
use App\Models\Routine;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

beforeEach(function () {
    $this->inviter = User::factory()->create(['name' => 'Luciano']);
});

function registration(array $overrides = []): array
{
    return [
        'token' => 'good-token',
        'name' => 'Pedro',
        'email' => 'pedro@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
        ...$overrides,
    ];
}

it('previews a valid invitation with the inviter name', function () {
    Invitation::factory()->for($this->inviter)->withToken('good-token')->create();

    $this->getJson('/auth/invitations/good-token')
        ->assertOk()
        ->assertJsonPath('data.inviter_name', 'Luciano');
});

it('rejects unknown, expired and used links', function () {
    Invitation::factory()->for($this->inviter)->withToken('expired-token')->expired()->create();
    Invitation::factory()->for($this->inviter)->withToken('used-token')->accepted()->create();

    $this->getJson('/auth/invitations/nope')->assertNotFound();
    $this->getJson('/auth/invitations/expired-token')->assertStatus(410);
    $this->getJson('/auth/invitations/used-token')->assertStatus(410);
});

it('registers, logs in and seeds only the base exercises', function () {
    $invitation = Invitation::factory()->for($this->inviter)->withToken('good-token')->create();

    $this->postJson('/auth/register', registration())
        ->assertCreated()
        ->assertJsonPath('data.email', 'pedro@example.com')
        ->assertJsonMissingPath('data.password');

    $pedro = User::where('email', 'pedro@example.com')->sole();
    $this->assertAuthenticatedAs($pedro);
    expect(Hash::check('secret123', $pedro->password))->toBeTrue()
        ->and(Exercise::withoutGlobalScopes()->where('user_id', $pedro->id)->count())->toBe(15)
        ->and(Routine::withoutGlobalScopes()->where('user_id', $pedro->id)->count())->toBe(0);

    $invitation->refresh();
    expect($invitation->accepted_at)->not->toBeNull()
        ->and($invitation->accepted_user_id)->toBe($pedro->id);
});

it('validates the form in spanish without consuming the invitation', function () {
    $invitation = Invitation::factory()->for($this->inviter)->withToken('good-token')->create();
    User::factory()->create(['email' => 'taken@example.com']);

    $this->postJson('/auth/register', registration(['email' => 'taken@example.com', 'password_confirmation' => 'otra-cosa']))
        ->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Este correo ya tiene una cuenta.')
        ->assertJsonPath('errors.password.0', 'Las contraseñas no coinciden.');

    expect($invitation->fresh()->accepted_at)->toBeNull();
    $this->assertGuest();
});

it('refuses expired, used or unknown invitations without creating the user', function () {
    Invitation::factory()->for($this->inviter)->withToken('expired-token')->expired()->create();
    Invitation::factory()->for($this->inviter)->withToken('used-token')->accepted()->create();

    foreach (['expired-token', 'used-token', 'nope'] as $token) {
        $this->postJson('/auth/register', registration(['token' => $token, 'email' => "{$token}@example.com"]))
            ->assertStatus(410)
            ->assertJsonPath('message', 'Este link de invitación ya no es válido.');
    }

    expect(User::count())->toBe(1);
    $this->assertGuest();
});
