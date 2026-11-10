<?php

use App\Models\User;

it('exposes when a demo expires, and null for real users', function () {
    $this->actingAs(User::factory()->create())->getJson('/api/user')
        ->assertOk()->assertJsonPath('data.demo_expires_at', null);

    $demo = User::factory()->create(['demo_expires_at' => now()->addHour()]);
    $this->actingAs($demo)->getJson('/api/user')
        ->assertOk()->assertJsonPath('data.demo_expires_at', $demo->demo_expires_at->toIso8601String());
});

it('rejects an expired demo with 401 and logs it out', function () {
    $demo = User::factory()->create(['demo_expires_at' => now()->subMinute()]);

    $this->actingAs($demo)->getJson('/api/today')->assertUnauthorized();
    $this->assertGuest('web');
});

it('does not let a demo invite people', function () {
    $demo = User::factory()->create(['demo_expires_at' => now()->addHour()]);

    $this->actingAs($demo)->postJson('/api/invitations')->assertForbidden();
    $this->actingAs(User::factory()->create())->postJson('/api/invitations')->assertCreated();
});
