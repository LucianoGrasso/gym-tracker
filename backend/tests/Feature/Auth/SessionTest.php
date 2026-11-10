<?php

use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create([
        'email' => 'luciano@gymtracker.test',
        'password' => 'secret123',
    ]);
});

it('logs in with valid credentials', function () {
    $this->postJson('/auth/login', [
        'email' => 'luciano@gymtracker.test',
        'password' => 'secret123',
    ])
        ->assertOk()
        ->assertJsonPath('data.email', 'luciano@gymtracker.test')
        ->assertJsonMissingPath('data.password');

    $this->assertAuthenticatedAs($this->user);
});

it('rejects invalid credentials with a spanish message', function () {
    $this->postJson('/auth/login', [
        'email' => 'luciano@gymtracker.test',
        'password' => 'wrong-password',
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'Correo o contraseña incorrectos.');

    $this->assertGuest();
});

it('validates the login payload', function () {
    $this->postJson('/auth/login', ['email' => 'no-es-correo'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email', 'password']);
});

it('returns the authenticated user', function () {
    $this->actingAs($this->user)
        ->getJson('/api/user')
        ->assertOk()
        ->assertExactJson(['data' => [
            'id' => $this->user->id,
            'name' => $this->user->name,
            'email' => $this->user->email,
            'demo_expires_at' => null,
        ]]);
});

it('returns 401 for guests on api routes', function () {
    $this->getJson('/api/user')->assertUnauthorized();
    $this->get('/api/user')->assertUnauthorized();
});

it('logs out', function () {
    $this->actingAs($this->user)
        ->postJson('/auth/logout')
        ->assertNoContent();

    $this->assertGuest('web');
});
