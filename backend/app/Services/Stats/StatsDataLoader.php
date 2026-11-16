<?php

namespace App\Services\Stats;

use App\Enums\ExerciseKind;
use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Workout;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** The only stats class that queries the database: everything else works on SetRow collections. */
final class StatsDataLoader
{
    /**
     * Every strength set of the authenticated user (archived exercises included, cardio left out), oldest first.
     *
     * @return Collection<int, SetRow>
     */
    public function sets(?int $exerciseId = null): Collection
    {
        $timeline = new BodyweightTimeline($this->bodyMetrics());

        return DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workouts as w', 'w.id', '=', 'we.workout_id')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->where('w.user_id', auth()->id())
            ->where('e.kind', ExerciseKind::Strength->value)
            ->when($exerciseId, fn ($query) => $query->where('we.exercise_id', $exerciseId))
            ->orderBy('w.date')
            ->orderBy('w.started_at')
            ->orderBy('we.position')
            ->orderBy('s.set_number')
            ->get([
                'w.id as workout_id', 'w.date', 'w.bodyweight_kg', 'we.exercise_id', 'e.name as exercise_name',
                'e.muscle_group', 'e.secondary_muscles', 'e.uses_bodyweight', 's.set_type', 's.weight_kg', 's.reps',
            ])
            ->map(function (object $row) use ($timeline) {
                // SQLite guarda las fechas como "Y-m-d H:i:s"; Postgres como "Y-m-d".
                $date = substr((string) $row->date, 0, 10);

                return new SetRow(
                    workoutId: $row->workout_id,
                    date: $date,
                    exerciseId: (int) $row->exercise_id,
                    exerciseName: $row->exercise_name,
                    muscleGroup: MuscleGroup::from($row->muscle_group),
                    usesBodyweight: (bool) $row->uses_bodyweight,
                    setType: SetType::from($row->set_type),
                    weightKg: (float) $row->weight_kg,
                    reps: (int) $row->reps,
                    bodyweightKg: $timeline->at($date, $row->bodyweight_kg === null ? null : (float) $row->bodyweight_kg),
                    secondaryMuscles: array_map(MuscleGroup::from(...), json_decode((string) ($row->secondary_muscles ?? '[]'), true) ?? []),
                );
            });
    }

    /**
     * Every cardio segment of the authenticated user (archived exercises included), oldest first.
     *
     * @return Collection<int, CardioRow>
     */
    public function cardioSegments(?int $exerciseId = null): Collection
    {
        return DB::table('workout_sets as s')
            ->join('workout_exercises as we', 'we.id', '=', 's.workout_exercise_id')
            ->join('workouts as w', 'w.id', '=', 'we.workout_id')
            ->join('exercises as e', 'e.id', '=', 'we.exercise_id')
            ->where('w.user_id', auth()->id())
            ->where('e.kind', ExerciseKind::Cardio->value)
            ->when($exerciseId, fn ($query) => $query->where('we.exercise_id', $exerciseId))
            ->orderBy('w.date')
            ->orderBy('w.started_at')
            ->orderBy('we.position')
            ->orderBy('s.set_number')
            ->get([
                'w.id as workout_id', 'w.date', 'we.exercise_id', 'e.name as exercise_name', 's.duration_seconds',
                's.speed_kmh', 's.incline_pct', 's.distance_km', 's.avg_heart_rate', 's.calories',
            ])
            ->map(fn (object $row) => new CardioRow(
                workoutId: $row->workout_id,
                date: substr((string) $row->date, 0, 10),
                exerciseId: (int) $row->exercise_id,
                exerciseName: $row->exercise_name,
                durationSeconds: (int) $row->duration_seconds,
                speedKmh: $row->speed_kmh === null ? null : (float) $row->speed_kmh,
                inclinePct: $row->incline_pct === null ? null : (float) $row->incline_pct,
                distanceKm: $row->distance_km === null ? null : (float) $row->distance_km,
                avgHeartRate: $row->avg_heart_rate === null ? null : (int) $row->avg_heart_rate,
                calories: $row->calories === null ? null : (int) $row->calories,
            ));
    }

    /** @return list<string> local date of every session, oldest first */
    public function workoutDates(): array
    {
        return Workout::query()
            ->orderBy('date')
            ->get(['date'])
            ->map(fn (Workout $workout) => $workout->date->toDateString())
            ->all();
    }

    /** @return array<string, float> date => kg */
    public function bodyMetrics(): array
    {
        return BodyMetric::query()
            ->orderBy('date')
            ->get()
            ->mapWithKeys(fn (BodyMetric $metric) => [$metric->date->toDateString() => (float) $metric->bodyweight_kg])
            ->all();
    }

    /** @return array<string, float> date => kg typed when finishing a session (the last one of the day wins) */
    public function workoutBodyweights(): array
    {
        return Workout::query()
            ->whereNotNull('bodyweight_kg')
            ->orderBy('date')
            ->orderBy('started_at')
            ->get(['date', 'bodyweight_kg'])
            ->mapWithKeys(fn (Workout $workout) => [$workout->date->toDateString() => (float) $workout->bodyweight_kg])
            ->all();
    }
}
