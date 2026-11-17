<?php

use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
});

it('creates a health token and replaces the previous one', function () {
    $this->actingAs($this->user);

    $first = $this->postJson('/api/health-token')->assertCreated()->json('data.token');
    $second = $this->postJson('/api/health-token')->assertCreated()->json('data.token');

    expect($first)->not->toBe($second)
        ->and($this->user->tokens()->count())->toBe(1)
        ->and($this->user->tokens()->sole()->name)->toBe('health-shortcut')
        ->and($this->user->tokens()->sole()->abilities)->toBe(['health:sync']);
});

it('revokes the health token', function () {
    $this->actingAs($this->user);
    $this->user->createToken('health-shortcut', ['health:sync']);

    $this->deleteJson('/api/health-token')->assertNoContent();

    expect($this->user->tokens()->count())->toBe(0);
});

it('forbids health tokens for demo accounts', function () {
    $demo = User::factory()->create(['demo_expires_at' => now()->addHour()]);

    $this->actingAs($demo)->postJson('/api/health-token')->assertForbidden();
});

it('rejects personal tokens outside health sync', function () {
    $token = $this->user->createToken('health-shortcut', ['health:sync'])->plainTextToken;

    $this->withToken($token)->getJson('/api/workouts')->assertForbidden();
    $this->withToken($token)->getJson('/api/user')->assertForbidden();
    $this->withToken($token)->postJson('/api/health-token')->assertForbidden();
});

it('keeps the SPA session working on the main routes', function () {
    $this->actingAs($this->user)->getJson('/api/workouts')->assertOk();
});
