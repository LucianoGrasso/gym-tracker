<?php

namespace App\Services\Stats;

use App\Enums\Equipment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

/** Exercises trained at least 3 times in the last 4 weeks without beating their best estimated 1RM. */
final class StalledExercisesService
{
    public const WINDOW_DAYS = 28;

    public const MIN_SESSIONS = 3;

    public const DELOAD_FACTOR = 0.9;

    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
    ) {}

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  array<int, Equipment>  $active  active exercises: id => equipment
     * @return list<array{exercise_id: int, name: string, best_e1rm_kg: float, best_date: string, sessions_since: int, deload_kg: ?float}>
     */
    public function stalled(Collection $sets, array $active, string $today): array
    {
        $windowStart = CarbonImmutable::parse($today)->subDays(self::WINDOW_DAYS)->toDateString();

        return $sets
            ->filter(fn (SetRow $set) => isset($active[$set->exerciseId]))
            ->groupBy('exerciseId')
            ->map(fn (Collection $rows, int $id) => $this->evaluate($rows, $active[$id], $windowStart))
            ->filter()
            ->sortBy('best_date')
            ->values()
            ->all();
    }

    /**
     * @param  Collection<int, SetRow>  $rows  sets of one exercise, oldest first
     * @return array<string, mixed>|null
     */
    private function evaluate(Collection $rows, Equipment $equipment, string $windowStart): ?array
    {
        $sessions = $rows
            ->groupBy('workoutId')
            ->map(fn (Collection $sets) => [
                'date' => $sets->first()->date,
                'e1rm' => $sets
                    ->map(fn (SetRow $set) => $this->oneRepMax->forSet($set, $this->loads->load($set)))
                    ->filter(fn (?float $value) => $value !== null)
                    ->max(),
                'sets' => $sets,
            ])
            ->filter(fn (array $session) => $session['e1rm'] !== null)
            ->sortBy('date')
            ->values();

        $recent = $sessions->filter(fn (array $session) => $session['date'] >= $windowStart);
        $before = $sessions->filter(fn (array $session) => $session['date'] < $windowStart);
        if ($recent->count() < self::MIN_SESSIONS || $before->isEmpty()) {
            return null;
        }

        $best = $before->max('e1rm');
        if ($recent->max('e1rm') > $best) {
            return null;
        }
        $bestDate = $before->first(fn (array $session) => $session['e1rm'] >= $best)['date'];
        $first = $rows->first();

        return [
            'exercise_id' => $first->exerciseId,
            'name' => $first->exerciseName,
            'best_e1rm_kg' => (float) $best,
            'best_date' => $bestDate,
            'sessions_since' => $sessions->filter(fn (array $session) => $session['date'] > $bestDate)->count(),
            'deload_kg' => $this->deload($sessions->last()['sets'], $equipment),
        ];
    }

    /** @param  Collection<int, SetRow>  $lastSession */
    private function deload(Collection $lastSession, Equipment $equipment): ?float
    {
        $step = match ($equipment) {
            Equipment::Barbell, Equipment::Smith, Equipment::Dumbbell => 2.5,
            Equipment::Machine, Equipment::Cable => 5.0,
            Equipment::Kettlebell => 4.0,
            Equipment::Bodyweight, Equipment::Band => null,
        };
        if ($step === null || $lastSession->first()->usesBodyweight) {
            return null;
        }
        $heaviest = $lastSession->reject(fn (SetRow $set) => $set->isWarmup())->max('weightKg');

        // El épsilon evita que 17,9999… (error de coma flotante) baje un escalón.
        return floor(self::DELOAD_FACTOR * $heaviest / $step + 1e-9) * $step;
    }
}
