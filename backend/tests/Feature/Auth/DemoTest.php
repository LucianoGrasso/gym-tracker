<?php

use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutSet;
use Carbon\CarbonImmutable;

function startDemo()
{
    return test()->postJson('/auth/demo');
}

it('creates a 2 h demo account and logs it in, with a workout ready today', function () {
    $this->freezeSecond();

    $response = startDemo()->assertCreated()->assertJsonPath('data.name', 'Invitado');

    $user = User::findOrFail($response->json('data.id'));
    expect($user->demo_expires_at->equalTo(now()->addMinutes(120)))->toBeTrue();
    $this->assertAuthenticatedAs($user, 'web');

    $today = $this->getJson('/api/today')->assertOk()->json('data');
    expect($today['day'])->not->toBeNull();
    expect($today['day']['exercises'])->not->toBeEmpty();
});

it('names the shifted routine days with the right weekday', function () {
    startDemo()->assertCreated();
    $today = CarbonImmutable::now(config('app.user_timezone'));
    $names = [1 => 'Lunes', 2 => 'Martes', 3 => 'Miércoles', 4 => 'Jueves', 5 => 'Viernes', 6 => 'Sábado', 7 => 'Domingo'];

    $days = $this->getJson('/api/today')->json('data.days');
    expect($days)->toHaveCount(4);
    expect($days[0]['weekday'])->toBe($today->dayOfWeekIso);
    foreach ($days as $day) {
        expect($day['name'])->toStartWith($names[$day['weekday']].' – ');
    }
});

it('fills 6 weeks of believable history and bodyweight', function () {
    $user = User::findOrFail(startDemo()->json('data.id'));
    $today = CarbonImmutable::now(config('app.user_timezone'))->toDateString();

    $workouts = Workout::withoutGlobalScopes()->where('user_id', $user->id)->get();
    expect($workouts->count())->toBeGreaterThanOrEqual(22)->toBeLessThanOrEqual(24);
    expect($workouts->every(fn (Workout $w) => $w->date->toDateString() < $today && $w->finished_at !== null))->toBeTrue();

    expect(BodyMetric::withoutGlobalScopes()->where('user_id', $user->id)->count())->toBe(7);

    $bench = Exercise::withoutGlobalScopes()->where('user_id', $user->id)->where('name', 'Press de banca')->firstOrFail();
    $heavy = WorkoutSet::query()
        ->join('workout_exercises', 'workout_exercises.id', '=', 'workout_sets.workout_exercise_id')
        ->join('workouts', 'workouts.id', '=', 'workout_exercises.workout_id')
        ->where('workout_exercises.exercise_id', $bench->id)
        ->where('workout_exercises.default_set_type', SetType::Heavy->value)
        ->orderBy('workouts.date')
        ->get(['workout_sets.*', 'workouts.date']);
    expect($heavy->where('set_type', SetType::Warmup)->count())->toBeGreaterThan(0);
    $working = $heavy->where('set_type', SetType::Heavy);
    expect((float) $working->last()->weight_kg)->toBeGreaterThan((float) $working->first()->weight_kg);
});

it('purges expired demos, history included, and keeps the rest', function () {
    $old = User::findOrFail(startDemo()->json('data.id'));
    $old->update(['demo_expires_at' => now()->subMinute()]);
    $real = User::factory()->create();
    $this->app['auth']->forgetGuards();

    startDemo()->assertCreated();

    expect(User::find($old->id))->toBeNull();
    expect(Workout::withoutGlobalScopes()->where('user_id', $old->id)->exists())->toBeFalse();
    expect(User::find($real->id))->not->toBeNull();
    expect(User::whereNotNull('demo_expires_at')->count())->toBe(1);
});

it('refuses when 50 demos are active', function () {
    User::factory()->count(50)->create(['demo_expires_at' => now()->addHour()]);

    startDemo()->assertStatus(503)->assertJsonPath('message', 'La demo está llena. Intenta en un rato.');
});

it('allows 5 demos per hour from the same address', function () {
    foreach (range(1, 5) as $i) {
        startDemo()->assertCreated();
    }

    startDemo()->assertTooManyRequests();
});
