<?php

namespace App\Services\Demo;

use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Routine;
use App\Models\RoutineDay;
use App\Models\RoutineDayExercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Carbon\CarbonImmutable;
use Random\Engine\Mt19937;
use Random\Randomizer;

/** Historial ficticio pero creíble para la demo: 6 semanas de la rutina con progresión y peso corporal. */
class DemoHistory
{
    public const WEEKS = 6;

    private const MAX_SKIPPED = 2;

    /** Carga (kg) de las efectivas hace 6 semanas; 0 = solo peso corporal. */
    private const BASE_KG = [
        'Press de banca' => 70.0, 'Press con mancuernas' => 26.0, 'Press inclinado con mancuernas' => 22.0,
        'Elevaciones laterales' => 8.0, 'Dominadas' => 0.0, 'Remo con mancuerna' => 30.0,
        'Jalón al pecho' => 55.0, 'Curl de bíceps con mancuernas' => 12.0, 'Fondos' => 0.0,
        'Press de hombro con mancuernas' => 20.0, 'Extensión de tríceps en polea' => 25.0,
        'Sentadilla' => 80.0, 'Peso muerto rumano' => 70.0, 'Curl femoral' => 40.0, 'Gemelos en máquina' => 60.0,
    ];

    private const BILBO_KG = 40.0;

    private Randomizer $random;

    /** @var array<int, int> sesiones previas por ejercicio de la rutina */
    private array $sessions = [];

    public function generate(User $user, Routine $routine, CarbonImmutable $today): void
    {
        $this->random = new Randomizer(new Mt19937(2026));
        $this->sessions = [];
        $days = $routine->days()->with('exercises.exercise')->get()->keyBy('weekday');

        $skipped = 0;
        for ($ago = self::WEEKS * 7; $ago >= 1; $ago--) {
            $date = $today->subDays($ago);
            $day = $days->get($date->dayOfWeekIso);
            if ($day === null) {
                continue;
            }
            if ($skipped < self::MAX_SKIPPED && $this->random->getInt(1, 10) === 1) {
                $skipped++;

                continue;
            }
            $this->workout($user, $day, $date);
        }

        for ($week = self::WEEKS; $week >= 0; $week--) {
            BodyMetric::create([
                'user_id' => $user->id,
                'date' => $today->subWeeks($week)->toDateString(),
                'bodyweight_kg' => round(79.2 - 0.25 * (self::WEEKS - $week) + $this->random->getInt(-3, 3) / 10, 1),
            ]);
        }
    }

    private function workout(User $user, RoutineDay $day, CarbonImmutable $date): void
    {
        $start = $date->setTime(19, $this->random->getInt(0, 40))->utc();
        $workout = Workout::create([
            'user_id' => $user->id,
            'routine_day_id' => $day->id,
            'date' => $date->toDateString(),
            'started_at' => $start,
            'finished_at' => $start->addMinutes($this->random->getInt(55, 80)),
        ]);

        foreach ($day->exercises as $item) {
            $entry = WorkoutExercise::create([
                'workout_id' => $workout->id,
                'exercise_id' => $item->exercise_id,
                'position' => $item->position,
                'target_sets' => $item->target_sets,
                'target_reps_min' => $item->target_reps_min,
                'target_reps_max' => $item->target_reps_max,
                'target_text' => $item->target_text,
                'default_set_type' => $item->default_set_type,
                'rest_seconds' => $item->rest_seconds,
            ]);
            $session = $this->sessions[$item->id] = ($this->sessions[$item->id] ?? -1) + 1;
            $this->sets($entry, $item, $session);
        }
    }

    private function sets(WorkoutExercise $entry, RoutineDayExercise $item, int $session): void
    {
        $type = $item->default_set_type;
        $base = self::BASE_KG[$item->exercise->name] ?? 20.0;
        // Sube 2,5 kg cada 3 sesiones del ejercicio.
        $weight = $base > 0 ? $base + 2.5 * intdiv($session, 3) : 0.0;
        $number = 1;

        if ($type === SetType::Heavy) {
            foreach ([[0.5, 8], [0.7, 4]] as [$share, $reps]) {
                $this->set($entry, $number++, SetType::Warmup, round($weight * $share / 2.5) * 2.5, $reps);
            }
        }

        for ($i = 0; $i < ($item->target_sets ?? 3); $i++) {
            if ($type === SetType::Bilbo) {
                $this->set($entry, $number++, $type, self::BILBO_KG, 28 + $session + $this->random->getInt(0, 1));

                continue;
            }
            $reps = $this->random->getInt($item->target_reps_min ?? 8, $item->target_reps_max ?? 12);
            $this->set($entry, $number++, $type, $weight, $reps);
        }
    }

    private function set(WorkoutExercise $entry, int $number, SetType $type, float $weight, int $reps): void
    {
        $entry->sets()->create([
            'set_number' => $number,
            'set_type' => $type,
            'weight_kg' => $weight,
            'reps' => $reps,
        ]);
    }
}
