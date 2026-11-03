<?php

use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;

it('returns the sessions of an exercise newest first', function () {
    $user = User::factory()->create();
    $exercise = Exercise::factory()->for($user)->create();
    foreach (['2026-10-01' => 2, '2026-10-08' => 1, '2026-10-10' => 0] as $date => $setCount) {
        $workout = Workout::factory()->for($user)->create(['date' => $date]);
        $workoutExercise = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
        WorkoutSet::factory()->count($setCount)->sequence(fn ($s) => ['set_number' => $s->index + 1])
            ->create(['workout_exercise_id' => $workoutExercise->id, 'weight_kg' => 42.5, 'reps' => 30]);
    }

    $this->actingAs($user)
        ->getJson("/api/exercises/{$exercise->id}/history")
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.date', '2026-10-08')
        ->assertJsonPath('data.1.date', '2026-10-01')
        ->assertJsonCount(2, 'data.1.sets')
        ->assertJsonPath('data.1.sets.0.weight_kg', 42.5)
        ->assertJsonPath('data.1.sets.0.reps', 30)
        ->assertJsonPath('meta.current_page', 1);
});

it('hides the history of other users exercises', function () {
    $this->actingAs(User::factory()->create())
        ->getJson('/api/exercises/'.Exercise::factory()->create()->id.'/history')
        ->assertNotFound();
});
