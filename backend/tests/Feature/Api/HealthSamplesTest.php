<?php

use App\Models\User;
use App\Models\Workout;
use Illuminate\Support\Carbon;

beforeEach(function () {
    Carbon::setTestNow('2026-11-18 12:00:00');
    $this->user = User::factory()->create();
    $this->token = $this->user->createToken('health-shortcut', ['health:sync'])->plainTextToken;
    // 16/11 12:14–13:02 en Chile (UTC−3)
    $this->workout = Workout::factory()->for($this->user)->create([
        'date' => '2026-11-16', 'started_at' => '2026-11-16 15:14:00', 'finished_at' => '2026-11-16 16:02:00',
    ]);
});

afterEach(fn () => Carbon::setTestNow());

function samplesPayload(array $overrides = []): array
{
    return array_merge([
        'heart_rate_values' => "72\n120\n150\n162\n90",
        'heart_rate_dates' => implode("\n", [
            '2026-11-16T12:00:00-03:00', // antes de la sesión
            '2026-11-16T12:20:00-03:00',
            '2026-11-16T12:40:00-03:00',
            '2026-11-16T13:00:00-03:00',
            '2026-11-16T13:30:00-03:00', // después
        ]),
        'energy_values' => "5,5\n200,25\n150,25\n9",
        'energy_dates' => implode("\n", [
            '2026-11-16T12:10:00-03:00',
            '2026-11-16T12:30:00-03:00',
            '2026-11-16T12:50:00-03:00',
            '2026-11-16T14:00:00-03:00',
        ]),
    ], $overrides);
}

it('computes heart rate and calories inside each session window', function () {
    $this->withToken($this->token)->postJson('/api/health-sync/samples', samplesPayload())
        ->assertOk()
        ->assertJsonPath('data.0.id', $this->workout->id)
        ->assertJsonPath('data.0.avg_heart_rate', 144)
        ->assertJsonPath('data.0.active_calories', 351)
        ->assertJsonPath('summary', '16/11: ♥ 144 ppm prom · 351 kcal');

    $this->workout->refresh();
    expect($this->workout->avg_heart_rate)->toBe(144)
        ->and($this->workout->max_heart_rate)->toBeNull()
        ->and($this->workout->active_calories)->toBe(351)
        ->and($this->workout->health_synced_at)->not->toBeNull();
});

it('accepts lists as JSON arrays', function () {
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'heart_rate_values' => [120, '150'],
        'heart_rate_dates' => ['2026-11-16T12:20:00-03:00', '2026-11-16T12:40:00-03:00'],
    ])->assertOk()->assertJsonPath('data.0.avg_heart_rate', 135)->assertJsonPath('data.0.active_calories', null);
});

it('leaves sessions untouched when no sample falls inside them', function () {
    $this->workout->update(['avg_heart_rate' => 130]);

    $this->withToken($this->token)->postJson('/api/health-sync/samples', samplesPayload([
        'heart_rate_values' => '80', 'heart_rate_dates' => '2026-11-17T09:00:00-03:00',
        'energy_values' => '', 'energy_dates' => '',
    ]))->assertOk()
        ->assertJsonPath('data', [])
        ->assertJsonPath('summary', 'Sin datos de Salud en tus sesiones de las últimas 48 h.');

    expect($this->workout->refresh()->avg_heart_rate)->toBe(130);
});

it('ignores unfinished, old and foreign sessions', function () {
    Workout::factory()->for($this->user)->create(['started_at' => '2026-11-16 15:00:00', 'finished_at' => null]);
    Workout::factory()->for($this->user)->create([
        'started_at' => '2026-11-10 15:00:00', 'finished_at' => '2026-11-10 16:00:00',
    ]);
    Workout::factory()->create(['started_at' => '2026-11-16 15:00:00', 'finished_at' => '2026-11-16 16:30:00']);

    $this->withToken($this->token)->postJson('/api/health-sync/samples', samplesPayload())
        ->assertOk()->assertJsonCount(1, 'data');
});

it('rejects lists of different lengths', function () {
    $this->withToken($this->token)->postJson('/api/health-sync/samples', samplesPayload(['heart_rate_values' => '120']))
        ->assertUnprocessable()->assertJsonValidationErrors('heart_rate_dates');
});

it('requires the health:sync ability', function () {
    $token = $this->user->createToken('other', ['something'])->plainTextToken;

    $this->withToken($token)->postJson('/api/health-sync/samples', samplesPayload())->assertForbidden();
});

it('reads dates without offset as Chilean local time', function () {
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'heart_rate_values' => "120\n80",
        'heart_rate_dates' => "2026-11-16T12:20:00\n2026-11-16T15:20:00",
    ])->assertOk()->assertJsonPath('data.0.avg_heart_rate', 120);
});

it('weights the average heart rate by how long each sample lasts', function () {
    $this->workout->update(['max_heart_rate' => 170]);

    // Bloque de 5 min a 100 lpm y una muestra de 5 s a 160 lpm: sin ponderar daría 130.
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'heart_rate_values' => "100\n160",
        'heart_rate_dates' => "2026-11-16T12:20:00-03:00\n2026-11-16T13:01:00-03:00",
        'heart_rate_end_dates' => "2026-11-16T12:25:00-03:00\n2026-11-16T13:01:05-03:00",
    ])->assertOk()->assertJsonPath('data.0.avg_heart_rate', 101);

    expect($this->workout->refresh()->max_heart_rate)->toBeNull();
});

it('only counts the part of a sample that falls inside the session', function () {
    // El bloque empieza a las 13:00 y dura 10 min, pero la sesión termina 13:02: pesa 2 min.
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'heart_rate_values' => "100\n130",
        'heart_rate_dates' => "2026-11-16T12:20:00-03:00\n2026-11-16T13:00:00-03:00",
        'heart_rate_end_dates' => "2026-11-16T12:22:00-03:00\n2026-11-16T13:10:00-03:00",
    ])->assertOk()->assertJsonPath('data.0.avg_heart_rate', 115);
});

it('rejects end dates that do not match the values', function () {
    $this->withToken($this->token)->postJson('/api/health-sync/samples', samplesPayload(['heart_rate_end_dates' => '2026-11-16T12:25:00-03:00']))
        ->assertUnprocessable()->assertJsonValidationErrors('heart_rate_end_dates');
});

it('counts the overlapping part of samples that start before the session', function () {
    // Sesión 12:14–13:02. Bloque 12:10–12:20 a 80 lpm pesa 6 min; bloque 12:20–12:26 a 110 pesa 6 min.
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'heart_rate_values' => "80\n110",
        'heart_rate_dates' => "2026-11-16T12:10:00-03:00\n2026-11-16T12:20:00-03:00",
        'heart_rate_end_dates' => "2026-11-16T12:20:00-03:00\n2026-11-16T12:26:00-03:00",
    ])->assertOk()->assertJsonPath('data.0.avg_heart_rate', 95);
});

it('prorates calories by the overlapping part of each sample', function () {
    // 100 kcal entre 12:04 y 12:24: 10 de sus 20 min caen en la sesión → 50; 30 kcal adentro → total 80.
    $this->withToken($this->token)->postJson('/api/health-sync/samples', [
        'energy_values' => "100\n30",
        'energy_dates' => "2026-11-16T12:04:00-03:00\n2026-11-16T12:30:00-03:00",
        'energy_end_dates' => "2026-11-16T12:24:00-03:00\n2026-11-16T12:35:00-03:00",
    ])->assertOk()->assertJsonPath('data.0.active_calories', 80);
});
