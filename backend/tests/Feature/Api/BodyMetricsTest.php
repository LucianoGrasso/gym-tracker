<?php

use App\Models\BodyMetric;
use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('creates and then updates the bodyweight of a date', function () {
    $this->putJson('/api/body-metrics/2026-11-04', ['bodyweight_kg' => 78.5])
        ->assertCreated()
        ->assertJsonPath('data.date', '2026-11-04')
        ->assertJsonPath('data.bodyweight_kg', 78.5);

    $this->putJson('/api/body-metrics/2026-11-04', ['bodyweight_kg' => 78.2])
        ->assertOk()
        ->assertJsonPath('data.bodyweight_kg', 78.2);

    expect(BodyMetric::count())->toBe(1);
});

it('validates the date and the weight', function () {
    $this->putJson('/api/body-metrics/04-11-2026', ['bodyweight_kg' => 5])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['date', 'bodyweight_kg']);
});

it('lists own metrics in a date range, oldest first', function () {
    foreach (['2026-10-20' => 79, '2026-10-01' => 80, '2026-11-10' => 78] as $date => $kg) {
        BodyMetric::factory()->for($this->user)->create(['date' => $date, 'bodyweight_kg' => $kg]);
    }
    BodyMetric::factory()->create(['date' => '2026-10-15']);

    $this->getJson('/api/body-metrics?from=2026-10-01&to=2026-10-31')
        ->assertOk()
        ->assertJsonPath('data.*.date', ['2026-10-01', '2026-10-20']);
});
