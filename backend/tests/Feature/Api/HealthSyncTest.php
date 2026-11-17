<?php

use App\Models\User;
use App\Models\Workout;
use Illuminate\Support\Carbon;

beforeEach(function () {
    Carbon::setTestNow('2026-11-17 23:00:00');
    $this->user = User::factory()->create();
    $this->token = $this->user->createToken('health-shortcut', ['health:sync'])->plainTextToken;
});

afterEach(fn () => Carbon::setTestNow());

it('lists finished workouts of the last 48 hours with local offsets', function () {
    $recent = Workout::factory()->for($this->user)->create([
        'started_at' => '2026-11-17 22:00:00', 'finished_at' => '2026-11-17 23:00:00',
    ]);
    Workout::factory()->for($this->user)->create(['started_at' => '2026-11-17 22:30:00', 'finished_at' => null]);
    Workout::factory()->for($this->user)->create([
        'started_at' => '2026-11-14 22:00:00', 'finished_at' => '2026-11-14 23:00:00',
    ]);
    Workout::factory()->create(['started_at' => '2026-11-17 21:00:00', 'finished_at' => '2026-11-17 22:00:00']);

    $this->withToken($this->token)->getJson('/api/health-sync/workouts')
        ->assertOk()
        ->assertExactJson(['data' => [[
            'id' => $recent->id,
            'started_at' => '2026-11-17T19:00:00-03:00',
            'finished_at' => '2026-11-17T20:00:00-03:00',
        ]]]);
});

it('stores health data, rounding decimals and accepting comma decimals', function () {
    $workout = Workout::factory()->for($this->user)->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => '127,6',
        'max_heart_rate' => 171.2,
        'active_calories' => 412,
    ])->assertOk()->assertJsonPath('data.avg_heart_rate', 128);

    $workout->refresh();
    expect($workout->max_heart_rate)->toBe(171)
        ->and($workout->active_calories)->toBe(412)
        ->and($workout->health_synced_at->toDateTimeString())->toBe('2026-11-17 23:00:00');
});

it('overwrites previous values when sent again', function () {
    $workout = Workout::factory()->for($this->user)->create([
        'finished_at' => now(), 'avg_heart_rate' => 100, 'max_heart_rate' => 120, 'active_calories' => 50,
    ]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => 130, 'max_heart_rate' => null, 'active_calories' => 400,
    ])->assertOk();

    $workout->refresh();
    expect($workout->avg_heart_rate)->toBe(130)
        ->and($workout->max_heart_rate)->toBeNull()
        ->and($workout->active_calories)->toBe(400);
});

it('does not erase data when every value is empty', function () {
    $workout = Workout::factory()->for($this->user)->create([
        'finished_at' => now(), 'avg_heart_rate' => 128, 'health_synced_at' => '2026-11-17 20:00:00',
    ]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => '', 'max_heart_rate' => null, 'active_calories' => null,
    ])->assertOk();

    $workout->refresh();
    expect($workout->avg_heart_rate)->toBe(128)
        ->and($workout->health_synced_at->toDateTimeString())->toBe('2026-11-17 20:00:00');
});

it('validates ranges', function () {
    $workout = Workout::factory()->for($this->user)->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => 20, 'max_heart_rate' => 300, 'active_calories' => 6000,
    ])->assertUnprocessable()->assertJsonValidationErrors(['avg_heart_rate', 'max_heart_rate', 'active_calories']);
});

it('cannot touch workouts of other users', function () {
    $other = Workout::factory()->create(['finished_at' => now()]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$other->id}", ['avg_heart_rate' => 120])
        ->assertNotFound();
});

it('requires the health:sync ability', function () {
    $token = $this->user->createToken('other', ['something'])->plainTextToken;

    $this->withToken($token)->getJson('/api/health-sync/workouts')->assertForbidden();
});

it('rejects requests without a token', function () {
    $this->getJson('/api/health-sync/workouts')->assertUnauthorized();
});

it('treats zeros from empty statistics as missing data', function () {
    $workout = Workout::factory()->for($this->user)->create(['finished_at' => now(), 'avg_heart_rate' => 128]);

    $this->withToken($this->token)->putJson("/api/health-sync/workouts/{$workout->id}", [
        'avg_heart_rate' => 0, 'max_heart_rate' => '0', 'active_calories' => 0,
    ])->assertOk();

    expect($workout->refresh()->avg_heart_rate)->toBe(128);
});
