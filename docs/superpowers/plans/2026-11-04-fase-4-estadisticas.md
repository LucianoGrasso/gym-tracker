# Fase 4 — Estadísticas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver si hay progreso o estancamiento: 1RM estimado, mejor peso, volumen y reps totales por ejercicio en el tiempo, récords, volumen semanal por grupo muscular, constancia y peso corporal.

**Architecture:** Un `StatsDataLoader` (única pieza con BD) aplana las series del usuario en objetos `SetRow` con el peso corporal ya resuelto; servicios puros en `app/Services/Stats` calculan todo sobre colecciones y se prueban con tests unitarios sin BD. `StatsController` solo une request → loader → servicio → JSON. En Angular, funciones puras construyen las opciones de ECharts (probadas con Vitest) y las páginas solo las muestran.

**Tech Stack:** Laravel 13 + Pest; Angular 22, ngx-echarts 22, echarts 6 (import modular), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-gymtracker-design.md` (secciones 5, 6 "Peso" y "Stats", 8, 9).

## Global Constraints

- Las series `warmup` se excluyen de todos los cálculos (1RM, PRs, volumen y total de reps).
- 1RM estimado (Epley): `carga × (1 + reps / 30)`; si `reps = 1`, la carga. Solo series con **1 a 12 reps** y `set_type != bilbo`.
- Carga de una serie: `weight_kg`; si el ejercicio `uses_bodyweight`: `peso corporal efectivo + weight_kg`. Peso corporal efectivo = `workouts.bodyweight_kg` o, si falta, el último `body_metrics` con `date <= workouts.date`; si no hay, la carga es desconocida y la serie se excluye de cálculos de carga (no de los de reps).
- Unilaterales: cada serie (izq/der) suma por separado con su peso por mano.
- Períodos `4w`, `12w`, `6m`, `1y`, `all` (por defecto `12w`), en `America/Santiago`; semanas de lunes a domingo; `4w`/`12w` = la semana actual y las 3/11 anteriores; `6m`/`1y` = desde el lunes de la semana de hoy menos 6 meses/1 año.
- Ejercicios archivados se incluyen siempre.
- La lógica de estadísticas vive en `app/Services/Stats`, nunca en controladores.
- Los tests feature comparan JSON con `assertSame`: los números que el backend envía como float (kg, volumen, 1RM) se esperan como float (`90.0`, no `90`).
- UI en español (Chile): `42,5 kg`, `dd/mm/aaaa`; objetivos táctiles ≥ 48 px; dirección visual "Pista" (acento lima `#c8f135`, superficie de tarjeta `#181a15`).
- Colores de grupos musculares: paleta categórica validada con el script de la skill dataviz contra `#181a15` (todas las comprobaciones en PASS), orden fijo, "otro" en gris. Una métrica por gráfico: nunca dos ejes Y.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File Structure

```
backend/
├── app/Enums/StatsPeriod.php
├── app/Services/Stats/
│   ├── SetRow.php                     serie aplanada (DTO inmutable)
│   ├── StatsCalendar.php              inicio de semana, lista de semanas
│   ├── BodyweightTimeline.php         peso corporal efectivo por sesión
│   ├── EffectiveLoadResolver.php
│   ├── OneRepMaxCalculator.php
│   ├── VolumeCalculator.php
│   ├── PersonalRecordsService.php
│   ├── ExerciseProgressService.php
│   ├── ConsistencyService.php
│   ├── WeeklyMuscleVolumeService.php
│   ├── BodyweightSeriesService.php
│   ├── OverviewService.php
│   └── StatsDataLoader.php            única clase con consultas
├── app/Http/Requests/{StatsRequest,BodyMetricRequest,ListBodyMetricsRequest}.php
├── app/Http/Resources/BodyMetricResource.php
├── app/Http/Controllers/{StatsController,BodyMetricController}.php
├── routes/api.php
└── tests/
    ├── Pest.php                       + helper statsSet()
    ├── Unit/Stats/*.php
    └── Feature/Api/{BodyMetricsTest,StatsDataLoaderTest,StatsTest}.php

frontend/src/app/
├── app.config.ts                      + provideEchartsCore
├── app.routes.ts                      estadisticas/ y estadisticas/ejercicios/:id
├── core/models/stats.ts
├── core/models/labels.ts              + PERIOD_LABELS, STATS_PERIODS
├── core/format/format.ts              + formatShortDate, addDays, localToday
├── core/api/{stats-api,body-metrics-api}.ts
├── shared/charts/{echarts-setup,chart-theme,chart-options}.ts
├── shared/ui/chip-group.ts
└── features/stats/{stats-page,exercise-stats-page,format-record}.ts
    features/exercises/exercise-detail-page.ts   + "Ver estadísticas"
```

---

### Task 1: Calculadoras base (período, carga, 1RM, volumen)

**Files:**
- Create: `backend/app/Enums/StatsPeriod.php`
- Create: `backend/app/Services/Stats/SetRow.php`, `StatsCalendar.php`, `BodyweightTimeline.php`, `EffectiveLoadResolver.php`, `OneRepMaxCalculator.php`, `VolumeCalculator.php`
- Modify: `backend/tests/Pest.php` (helper `statsSet`)
- Test: `backend/tests/Unit/Stats/CalculatorsTest.php`

**Interfaces:**
- Produces:
  - `StatsPeriod` (`'4w'|'12w'|'6m'|'1y'|'all'`) con `startDate(CarbonImmutable $today): ?CarbonImmutable`.
  - `SetRow(workoutId, date, exerciseId, exerciseName, muscleGroup, usesBodyweight, setType, weightKg, reps, bodyweightKg)` + `isWarmup()`.
  - `StatsCalendar::weekStart(string $date): string`, `StatsCalendar::weeks(string $firstWeek, string $lastWeek): list<string>`.
  - `BodyweightTimeline(array<string,float> $metrics)->at(string $date, ?float $workoutBodyweight): ?float`.
  - `EffectiveLoadResolver->load(SetRow): ?float`.
  - `OneRepMaxCalculator->epley(float $load, int $reps): float`, `->forSet(SetRow, ?float $load): ?float`, `MAX_REPS = 12`.
  - `VolumeCalculator(EffectiveLoadResolver)->volume(iterable<SetRow>): float`, `->totalReps(iterable<SetRow>): int`.
  - Helper de tests `statsSet(array $overrides = []): SetRow`.

- [ ] **Step 1: Helper de tests**

Al final de `backend/tests/Pest.php` agregar:

```php
/**
 * SetRow de prueba: press de banca, 100 kg × 5, serie normal, sin peso corporal.
 *
 * @param  array<string, mixed>  $overrides
 */
function statsSet(array $overrides = []): App\Services\Stats\SetRow
{
    return new App\Services\Stats\SetRow(...array_merge([
        'workoutId' => 'w1',
        'date' => '2026-11-02',
        'exerciseId' => 1,
        'exerciseName' => 'Press de banca',
        'muscleGroup' => App\Enums\MuscleGroup::Chest,
        'usesBodyweight' => false,
        'setType' => App\Enums\SetType::Normal,
        'weightKg' => 100.0,
        'reps' => 5,
        'bodyweightKg' => null,
    ], $overrides));
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`backend/tests/Unit/Stats/CalculatorsTest.php`:

```php
<?php

use App\Enums\SetType;
use App\Enums\StatsPeriod;
use App\Services\Stats\BodyweightTimeline;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\StatsCalendar;
use App\Services\Stats\VolumeCalculator;
use Carbon\CarbonImmutable;

describe('StatsPeriod', function () {
    it('starts on a monday, counting the current week', function () {
        $today = CarbonImmutable::parse('2026-11-04'); // miércoles

        expect(StatsPeriod::FourWeeks->startDate($today)->toDateString())->toBe('2026-10-12')
            ->and(StatsPeriod::TwelveWeeks->startDate($today)->toDateString())->toBe('2026-08-17')
            ->and(StatsPeriod::SixMonths->startDate($today)->toDateString())->toBe('2026-05-04')
            ->and(StatsPeriod::OneYear->startDate($today)->toDateString())->toBe('2025-11-03')
            ->and(StatsPeriod::All->startDate($today))->toBeNull();
    });
});

describe('StatsCalendar', function () {
    it('finds the monday of the week, sunday included', function () {
        expect(StatsCalendar::weekStart('2026-11-08'))->toBe('2026-11-02')
            ->and(StatsCalendar::weekStart('2026-11-09'))->toBe('2026-11-09')
            ->and(StatsCalendar::weekStart('2026-11-02 00:00:00'))->toBe('2026-11-02');
    });

    it('lists the weeks between two mondays', function () {
        expect(StatsCalendar::weeks('2026-10-19', '2026-11-02'))->toBe(['2026-10-19', '2026-10-26', '2026-11-02'])
            ->and(StatsCalendar::weeks('2026-11-02', '2026-11-02'))->toBe(['2026-11-02']);
    });
});

describe('BodyweightTimeline', function () {
    $timeline = new BodyweightTimeline(['2026-10-20' => 79.0, '2026-10-01' => 80.0]);

    it('prefers the bodyweight logged in the session', function () use ($timeline) {
        expect($timeline->at('2026-10-25', 78.5))->toBe(78.5);
    });

    it('falls back to the latest metric on or before the date', function () use ($timeline) {
        expect($timeline->at('2026-10-20', null))->toBe(79.0)
            ->and($timeline->at('2026-10-19', null))->toBe(80.0);
    });

    it('is unknown before the first metric', function () use ($timeline) {
        expect($timeline->at('2026-09-30', null))->toBeNull();
    });
});

describe('EffectiveLoadResolver', function () {
    $loads = new EffectiveLoadResolver;

    it('uses the weight for regular exercises', function () use ($loads) {
        expect($loads->load(statsSet(['weightKg' => 42.5])))->toBe(42.5);
    });

    it('adds the bodyweight for bodyweight exercises', function () use ($loads) {
        expect($loads->load(statsSet(['usesBodyweight' => true, 'weightKg' => 10.0, 'bodyweightKg' => 78.0])))->toBe(88.0);
    });

    it('is unknown when the bodyweight is unknown', function () use ($loads) {
        expect($loads->load(statsSet(['usesBodyweight' => true, 'weightKg' => 0.0])))->toBeNull();
    });
});

describe('OneRepMaxCalculator', function () {
    $oneRepMax = new OneRepMaxCalculator;

    it('applies epley and returns the load for a single', function () use ($oneRepMax) {
        expect($oneRepMax->epley(100, 5))->toBe(116.67)
            ->and($oneRepMax->epley(80, 8))->toBe(101.33)
            ->and($oneRepMax->epley(90, 1))->toBe(90.0);
    });

    it('only uses working sets of 1 to 12 reps that are not bilbo', function () use ($oneRepMax) {
        expect($oneRepMax->forSet(statsSet(['reps' => 12]), 60.0))->toBe(84.0)
            ->and($oneRepMax->forSet(statsSet(['reps' => 13]), 60.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['reps' => 0]), 60.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['setType' => SetType::Bilbo, 'reps' => 10]), 45.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(['setType' => SetType::Warmup]), 40.0))->toBeNull()
            ->and($oneRepMax->forSet(statsSet(), null))->toBeNull();
    });
});

describe('VolumeCalculator', function () {
    $volume = new VolumeCalculator(new EffectiveLoadResolver);

    it('sums load × reps of working sets, skipping warmups and unknown loads', function () use ($volume) {
        $sets = [
            statsSet(['weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['weightKg' => 100.0, 'reps' => 5]),
            statsSet(['weightKg' => 100.0, 'reps' => 4]),
            statsSet(['usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 8]),
        ];

        expect($volume->volume($sets))->toBe(900.0)
            ->and($volume->totalReps($sets))->toBe(17);
    });

    it('adds left and right sides separately with their per-hand weight', function () use ($volume) {
        $sets = [
            statsSet(['weightKg' => 20.0, 'reps' => 10]),
            statsSet(['weightKg' => 20.0, 'reps' => 9]),
        ];

        expect($volume->volume($sets))->toBe(380.0)
            ->and($volume->totalReps($sets))->toBe(19);
    });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats`
Expected: FAIL (clases inexistentes).

- [ ] **Step 4: Implementar**

`backend/app/Enums/StatsPeriod.php`:

```php
<?php

namespace App\Enums;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

enum StatsPeriod: string
{
    case FourWeeks = '4w';
    case TwelveWeeks = '12w';
    case SixMonths = '6m';
    case OneYear = '1y';
    case All = 'all';

    /** First local date included in the period (a monday), or null for all time. */
    public function startDate(CarbonImmutable $today): ?CarbonImmutable
    {
        $week = $today->startOfWeek(CarbonInterface::MONDAY);

        return match ($this) {
            self::FourWeeks => $week->subWeeks(3),
            self::TwelveWeeks => $week->subWeeks(11),
            self::SixMonths => $today->subMonthsNoOverflow(6)->startOfWeek(CarbonInterface::MONDAY),
            self::OneYear => $today->subYearNoOverflow()->startOfWeek(CarbonInterface::MONDAY),
            self::All => null,
        };
    }
}
```

`backend/app/Services/Stats/SetRow.php`:

```php
<?php

namespace App\Services\Stats;

use App\Enums\MuscleGroup;
use App\Enums\SetType;

/** One logged set, flattened with what the stats need (bodyweight already resolved). */
final readonly class SetRow
{
    public function __construct(
        public string $workoutId,
        public string $date,
        public int $exerciseId,
        public string $exerciseName,
        public MuscleGroup $muscleGroup,
        public bool $usesBodyweight,
        public SetType $setType,
        public float $weightKg,
        public int $reps,
        public ?float $bodyweightKg,
    ) {}

    public function isWarmup(): bool
    {
        return $this->setType === SetType::Warmup;
    }
}
```

`backend/app/Services/Stats/StatsCalendar.php`:

```php
<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/** Monday-to-sunday weeks over local dates ("Y-m-d"). */
final class StatsCalendar
{
    public static function weekStart(string $date): string
    {
        return CarbonImmutable::parse(substr($date, 0, 10))
            ->startOfWeek(CarbonInterface::MONDAY)
            ->toDateString();
    }

    /** @return list<string> mondays from $firstWeek to $lastWeek, both included */
    public static function weeks(string $firstWeek, string $lastWeek): array
    {
        $weeks = [];
        for ($week = CarbonImmutable::parse($firstWeek); $week->toDateString() <= $lastWeek; $week = $week->addWeek()) {
            $weeks[] = $week->toDateString();
        }

        return $weeks;
    }
}
```

`backend/app/Services/Stats/BodyweightTimeline.php`:

```php
<?php

namespace App\Services\Stats;

/** Effective bodyweight of a session: the one logged in it, else the latest metric up to that date. */
final class BodyweightTimeline
{
    /** @var array<string, float> */
    private array $metrics;

    /** @param array<string, float> $metrics date ("Y-m-d") => kg */
    public function __construct(array $metrics)
    {
        ksort($metrics);
        $this->metrics = $metrics;
    }

    public function at(string $date, ?float $workoutBodyweight): ?float
    {
        if ($workoutBodyweight !== null) {
            return $workoutBodyweight;
        }

        $found = null;
        foreach ($this->metrics as $metricDate => $kg) {
            if ($metricDate > $date) {
                break;
            }
            $found = $kg;
        }

        return $found;
    }
}
```

`backend/app/Services/Stats/EffectiveLoadResolver.php`:

```php
<?php

namespace App\Services\Stats;

final class EffectiveLoadResolver
{
    /** Load in kg of a set, or null when it depends on an unknown bodyweight. */
    public function load(SetRow $set): ?float
    {
        if (! $set->usesBodyweight) {
            return $set->weightKg;
        }

        return $set->bodyweightKg === null ? null : $set->bodyweightKg + $set->weightKg;
    }
}
```

`backend/app/Services/Stats/OneRepMaxCalculator.php`:

```php
<?php

namespace App\Services\Stats;

use App\Enums\SetType;

final class OneRepMaxCalculator
{
    public const MAX_REPS = 12;

    /** Epley: load × (1 + reps / 30); a single is the load itself. */
    public function epley(float $load, int $reps): float
    {
        return $reps === 1 ? $load : round($load * (1 + $reps / 30), 2);
    }

    /** Estimated 1RM of a set, or null when the set does not qualify (warmup, bilbo, reps outside 1-12, unknown load). */
    public function forSet(SetRow $set, ?float $load): ?float
    {
        if ($load === null || $set->isWarmup() || $set->setType === SetType::Bilbo) {
            return null;
        }
        if ($set->reps < 1 || $set->reps > self::MAX_REPS) {
            return null;
        }

        return $this->epley($load, $set->reps);
    }
}
```

`backend/app/Services/Stats/VolumeCalculator.php`:

```php
<?php

namespace App\Services\Stats;

final class VolumeCalculator
{
    public function __construct(private readonly EffectiveLoadResolver $loads) {}

    /**
     * Σ load × reps of working sets with a known load (each side of a unilateral set counts on its own).
     *
     * @param  iterable<SetRow>  $sets
     */
    public function volume(iterable $sets): float
    {
        $total = 0.0;
        foreach ($sets as $set) {
            if ($set->isWarmup()) {
                continue;
            }
            $load = $this->loads->load($set);
            if ($load !== null) {
                $total += $load * $set->reps;
            }
        }

        return round($total, 2);
    }

    /** @param iterable<SetRow> $sets */
    public function totalReps(iterable $sets): int
    {
        $total = 0;
        foreach ($sets as $set) {
            if (! $set->isWarmup()) {
                $total += $set->reps;
            }
        }

        return $total;
    }
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats && vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(stats): add period, effective load, 1RM and volume calculators"
```

---

### Task 2: Récords personales y progreso por ejercicio

**Files:**
- Create: `backend/app/Services/Stats/PersonalRecordsService.php`, `ExerciseProgressService.php`
- Test: `backend/tests/Unit/Stats/ExerciseProgressTest.php`

**Interfaces:**
- Consumes: `SetRow`, `EffectiveLoadResolver`, `OneRepMaxCalculator`, `VolumeCalculator`, `statsSet()` (Task 1).
- Produces:
  - `PersonalRecordsService(EffectiveLoadResolver, OneRepMaxCalculator)->records(iterable<SetRow>): array{heaviest: ?array{load_kg: float, reps: int, date: string}, most_reps: ?array{reps: int, load_kg: ?float, date: string}, best_e1rm: ?array{e1rm_kg: float, load_kg: float, reps: int, date: string}}` (fecha = primera vez que se logró).
  - `ExerciseProgressService(EffectiveLoadResolver, OneRepMaxCalculator, VolumeCalculator, PersonalRecordsService)->progress(Collection<SetRow> $sets, ?string $from): array{sessions: list<array{workout_id, date, e1rm_kg: ?float, best_load_kg: ?float, best_load_reps: ?int, volume_kg: float, total_reps: int, bilbo: list<array{load_kg: ?float, reps: int}>}>, records: array}` — sesiones desde `$from`, récords de todo el historial.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Unit/Stats/ExerciseProgressTest.php`:

```php
<?php

use App\Enums\SetType;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\ExerciseProgressService;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\PersonalRecordsService;
use App\Services\Stats\VolumeCalculator;

function progressService(): ExerciseProgressService
{
    $loads = new EffectiveLoadResolver;
    $oneRepMax = new OneRepMaxCalculator;

    return new ExerciseProgressService($loads, $oneRepMax, new VolumeCalculator($loads), new PersonalRecordsService($loads, $oneRepMax));
}

describe('PersonalRecordsService', function () {
    $records = new PersonalRecordsService(new EffectiveLoadResolver, new OneRepMaxCalculator);

    it('finds the heaviest load, most reps and best 1RM with the date first achieved', function () use ($records) {
        $result = $records->records([
            statsSet(['date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 8]),
            statsSet(['date' => '2026-10-08', 'weightKg' => 90.0, 'reps' => 2]),
            statsSet(['date' => '2026-10-15', 'weightKg' => 90.0, 'reps' => 3]),
            statsSet(['date' => '2026-10-15', 'weightKg' => 45.0, 'reps' => 31, 'setType' => SetType::Bilbo]),
            statsSet(['date' => '2026-10-20', 'weightKg' => 120.0, 'reps' => 1, 'setType' => SetType::Warmup]),
        ]);

        expect($result['heaviest'])->toBe(['load_kg' => 90.0, 'reps' => 2, 'date' => '2026-10-08'])
            ->and($result['most_reps'])->toBe(['reps' => 31, 'load_kg' => 45.0, 'date' => '2026-10-15'])
            ->and($result['best_e1rm'])->toBe(['e1rm_kg' => 101.33, 'load_kg' => 80.0, 'reps' => 8, 'date' => '2026-10-01']);
    });

    it('is empty without working sets', function () use ($records) {
        expect($records->records([statsSet(['setType' => SetType::Warmup])]))
            ->toBe(['heaviest' => null, 'most_reps' => null, 'best_e1rm' => null]);
    });

    it('counts reps of bodyweight sets even when the load is unknown', function () use ($records) {
        $result = $records->records([statsSet(['usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 6])]);

        expect($result['heaviest'])->toBeNull()
            ->and($result['best_e1rm'])->toBeNull()
            ->and($result['most_reps'])->toBe(['reps' => 6, 'load_kg' => null, 'date' => '2026-11-02']);
    });
});

describe('ExerciseProgressService', function () {
    it('summarizes each session in date order', function () {
        $sets = collect([
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 8]),
            statsSet(['workoutId' => 'a', 'date' => '2026-10-01', 'weightKg' => 80.0, 'reps' => 6]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-08', 'weightKg' => 45.0, 'reps' => 31, 'setType' => SetType::Bilbo]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-08', 'weightKg' => 85.0, 'reps' => 5]),
        ]);

        $result = progressService()->progress($sets, null);

        expect($result['sessions'])->toBe([
            [
                'workout_id' => 'a', 'date' => '2026-10-01', 'e1rm_kg' => 101.33, 'best_load_kg' => 80.0,
                'best_load_reps' => 8, 'volume_kg' => 1120.0, 'total_reps' => 14, 'bilbo' => [],
            ],
            [
                'workout_id' => 'b', 'date' => '2026-10-08', 'e1rm_kg' => 99.17, 'best_load_kg' => 85.0,
                'best_load_reps' => 5, 'volume_kg' => 1820.0, 'total_reps' => 36,
                'bilbo' => [['load_kg' => 45.0, 'reps' => 31]],
            ],
        ])->and($result['records']['heaviest']['load_kg'])->toBe(85.0);
    });

    it('limits sessions to the period but keeps all-time records', function () {
        $sets = collect([
            statsSet(['workoutId' => 'old', 'date' => '2026-08-01', 'weightKg' => 95.0, 'reps' => 3]),
            statsSet(['workoutId' => 'new', 'date' => '2026-10-20', 'weightKg' => 85.0, 'reps' => 3]),
        ]);

        $result = progressService()->progress($sets, '2026-10-12');

        expect(array_column($result['sessions'], 'workout_id'))->toBe(['new'])
            ->and($result['records']['heaviest'])->toBe(['load_kg' => 95.0, 'reps' => 3, 'date' => '2026-08-01']);
    });

    it('skips sessions with only warmups and keeps reps when the bodyweight is unknown', function () {
        $sets = collect([
            statsSet(['workoutId' => 'w', 'date' => '2026-10-01', 'setType' => SetType::Warmup]),
            statsSet(['workoutId' => 'bw', 'date' => '2026-10-02', 'usesBodyweight' => true, 'weightKg' => 0.0, 'reps' => 6]),
        ]);

        expect(progressService()->progress($sets, null)['sessions'])->toBe([[
            'workout_id' => 'bw', 'date' => '2026-10-02', 'e1rm_kg' => null, 'best_load_kg' => null,
            'best_load_reps' => null, 'volume_kg' => 0.0, 'total_reps' => 6, 'bilbo' => [],
        ]]);
    });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats/ExerciseProgressTest.php`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`backend/app/Services/Stats/PersonalRecordsService.php`:

```php
<?php

namespace App\Services\Stats;

final class PersonalRecordsService
{
    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
    ) {}

    /**
     * Heaviest load, most reps (any load) and best estimated 1RM, each with the date it was first reached.
     *
     * @param  iterable<SetRow>  $sets
     * @return array{heaviest: ?array{load_kg: float, reps: int, date: string}, most_reps: ?array{reps: int, load_kg: ?float, date: string}, best_e1rm: ?array{e1rm_kg: float, load_kg: float, reps: int, date: string}}
     */
    public function records(iterable $sets): array
    {
        $heaviest = $mostReps = $bestE1rm = null;

        foreach (collect($sets)->sortBy('date') as $set) {
            if ($set->isWarmup()) {
                continue;
            }
            $load = $this->loads->load($set);

            if ($load !== null && ($heaviest === null || $load > $heaviest['load_kg'])) {
                $heaviest = ['load_kg' => $load, 'reps' => $set->reps, 'date' => $set->date];
            }
            if ($mostReps === null || $set->reps > $mostReps['reps']) {
                $mostReps = ['reps' => $set->reps, 'load_kg' => $load, 'date' => $set->date];
            }
            $e1rm = $this->oneRepMax->forSet($set, $load);
            if ($e1rm !== null && ($bestE1rm === null || $e1rm > $bestE1rm['e1rm_kg'])) {
                $bestE1rm = ['e1rm_kg' => $e1rm, 'load_kg' => $load, 'reps' => $set->reps, 'date' => $set->date];
            }
        }

        return ['heaviest' => $heaviest, 'most_reps' => $mostReps, 'best_e1rm' => $bestE1rm];
    }
}
```

`backend/app/Services/Stats/ExerciseProgressService.php`:

```php
<?php

namespace App\Services\Stats;

use App\Enums\SetType;
use Illuminate\Support\Collection;

final class ExerciseProgressService
{
    public function __construct(
        private readonly EffectiveLoadResolver $loads,
        private readonly OneRepMaxCalculator $oneRepMax,
        private readonly VolumeCalculator $volume,
        private readonly PersonalRecordsService $records,
    ) {}

    /**
     * Per-session series since $from (all time when null) plus all-time records.
     *
     * @param  Collection<int, SetRow>  $sets  every set of one exercise
     * @return array{sessions: list<array<string, mixed>>, records: array<string, mixed>}
     */
    public function progress(Collection $sets, ?string $from): array
    {
        $sessions = $sets
            ->filter(fn (SetRow $set) => $from === null || $set->date >= $from)
            ->groupBy('workoutId')
            ->map(fn (Collection $sessionSets) => $this->session($sessionSets))
            ->filter()
            ->sortBy('date')
            ->values()
            ->all();

        return ['sessions' => $sessions, 'records' => $this->records->records($sets)];
    }

    /**
     * @param  Collection<int, SetRow>  $sets
     * @return array<string, mixed>|null null when the session only has warmups
     */
    private function session(Collection $sets): ?array
    {
        $working = $sets->reject(fn (SetRow $set) => $set->isWarmup());
        if ($working->isEmpty()) {
            return null;
        }

        $loaded = $working
            ->map(fn (SetRow $set) => ['load' => $this->loads->load($set), 'reps' => $set->reps])
            ->filter(fn (array $entry) => $entry['load'] !== null);
        $bestLoad = $loaded->max('load');

        $first = $sets->first();

        return [
            'workout_id' => $first->workoutId,
            'date' => $first->date,
            'e1rm_kg' => $working
                ->map(fn (SetRow $set) => $this->oneRepMax->forSet($set, $this->loads->load($set)))
                ->filter(fn (?float $value) => $value !== null)
                ->max(),
            'best_load_kg' => $bestLoad,
            'best_load_reps' => $bestLoad === null ? null : $loaded->where('load', $bestLoad)->max('reps'),
            'volume_kg' => $this->volume->volume($sets),
            'total_reps' => $this->volume->totalReps($sets),
            'bilbo' => $working
                ->filter(fn (SetRow $set) => $set->setType === SetType::Bilbo)
                ->map(fn (SetRow $set) => ['load_kg' => $this->loads->load($set), 'reps' => $set->reps])
                ->values()
                ->all(),
        ];
    }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats && vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(stats): add personal records and per-exercise progress"
```

---

### Task 3: Constancia, volumen semanal por grupo, peso corporal y resumen

**Files:**
- Create: `backend/app/Services/Stats/ConsistencyService.php`, `WeeklyMuscleVolumeService.php`, `BodyweightSeriesService.php`, `OverviewService.php`
- Test: `backend/tests/Unit/Stats/OverviewTest.php`

**Interfaces:**
- Consumes: Task 1 y 2.
- Produces:
  - `ConsistencyService->summary(list<string> $workoutDates, CarbonImmutable $today, ?string $from): array{streak_weeks: int, weeks: list<array{week_start: string, sessions: int}>, days: list<array{date: string, sessions: int}>}` y `->streak(list<string>, CarbonImmutable): int`. La racha cuenta semanas seguidas con ≥ 1 sesión terminando en la actual; si la actual aún no tiene, parte de la anterior.
  - `WeeklyMuscleVolumeService(VolumeCalculator)->weekly(Collection<SetRow>, CarbonImmutable $today, ?string $from, ?MuscleGroup $only = null): array{muscle_groups: list<string>, weeks: list<array{week_start: string, volumes: array<string, float>}>}` (semanas sin entrenar en 0).
  - `BodyweightSeriesService->series(array<string,float> $metrics, array<string,float> $workouts, ?string $from): list<array{date: string, bodyweight_kg: float, source: 'metric'|'workout'}>` (si coinciden en fecha, gana el registro de peso).
  - `OverviewService(VolumeCalculator, PersonalRecordsService, ConsistencyService)->overview(Collection<SetRow> $sets, list<string> $workoutDates, CarbonImmutable $today, ?string $from): array{sessions: int, total_volume_kg: float, total_sets: int, streak_weeks: int, recent_records: list<array>, exercises: list<array{id: int, name: string, sessions: int}>}`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Unit/Stats/OverviewTest.php`:

```php
<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Services\Stats\BodyweightSeriesService;
use App\Services\Stats\ConsistencyService;
use App\Services\Stats\EffectiveLoadResolver;
use App\Services\Stats\OneRepMaxCalculator;
use App\Services\Stats\OverviewService;
use App\Services\Stats\PersonalRecordsService;
use App\Services\Stats\VolumeCalculator;
use App\Services\Stats\WeeklyMuscleVolumeService;
use Carbon\CarbonImmutable;

$today = CarbonImmutable::parse('2026-11-04'); // miércoles, semana del 02/11

describe('ConsistencyService', function () use ($today) {
    $consistency = new ConsistencyService;

    it('counts sessions per week and per day, zero-filling the weeks', function () use ($consistency, $today) {
        $result = $consistency->summary(['2026-10-12', '2026-10-14', '2026-10-14', '2026-10-27', '2026-11-03'], $today, '2026-10-12');

        expect($result['weeks'])->toBe([
            ['week_start' => '2026-10-12', 'sessions' => 3],
            ['week_start' => '2026-10-19', 'sessions' => 0],
            ['week_start' => '2026-10-26', 'sessions' => 1],
            ['week_start' => '2026-11-02', 'sessions' => 1],
        ])->and($result['days'])->toBe([
            ['date' => '2026-10-12', 'sessions' => 1],
            ['date' => '2026-10-14', 'sessions' => 2],
            ['date' => '2026-10-27', 'sessions' => 1],
            ['date' => '2026-11-03', 'sessions' => 1],
        ]);
    });

    it('counts the streak of weeks with sessions up to the current one', function () use ($consistency, $today) {
        expect($consistency->streak(['2026-10-12', '2026-10-27', '2026-11-03'], $today))->toBe(2);
    });

    it('does not break the streak because the current week has no session yet', function () use ($consistency, $today) {
        expect($consistency->streak(['2026-10-20', '2026-10-27'], $today))->toBe(2)
            ->and($consistency->streak([], $today))->toBe(0);
    });

    it('treats sunday as the end of the week', function () {
        $sunday = CarbonImmutable::parse('2026-11-08');

        expect((new ConsistencyService)->streak(['2026-11-08'], $sunday))->toBe(1);
    });
});

describe('WeeklyMuscleVolumeService', function () use ($today) {
    $weekly = new WeeklyMuscleVolumeService(new VolumeCalculator(new EffectiveLoadResolver));

    it('sums the volume per muscle group and week', function () use ($weekly, $today) {
        $sets = collect([
            statsSet(['date' => '2026-10-26', 'weightKg' => 100.0, 'reps' => 5]),
            statsSet(['date' => '2026-11-01', 'muscleGroup' => MuscleGroup::Back, 'weightKg' => 60.0, 'reps' => 10]),
            statsSet(['date' => '2026-11-02', 'weightKg' => 50.0, 'reps' => 10, 'setType' => SetType::Warmup]),
            statsSet(['date' => '2026-11-03', 'weightKg' => 80.0, 'reps' => 5]),
        ]);

        $result = $weekly->weekly($sets, $today, '2026-10-26');

        expect($result['muscle_groups'])->toBe(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'core', 'other'])
            ->and($result['weeks'][0]['week_start'])->toBe('2026-10-26')
            ->and($result['weeks'][0]['volumes']['chest'])->toBe(500.0)
            ->and($result['weeks'][0]['volumes']['back'])->toBe(600.0)
            ->and($result['weeks'][1]['volumes']['chest'])->toBe(400.0)
            ->and($result['weeks'][1]['volumes']['legs'])->toBe(0.0);
    });

    it('can keep a single muscle group', function () use ($weekly, $today) {
        $result = $weekly->weekly(collect([statsSet(['date' => '2026-11-03'])]), $today, '2026-11-02', MuscleGroup::Chest);

        expect($result)->toBe([
            'muscle_groups' => ['chest'],
            'weeks' => [['week_start' => '2026-11-02', 'volumes' => ['chest' => 500.0]]],
        ]);
    });
});

describe('BodyweightSeriesService', function () {
    it('merges metrics and session bodyweights by date, preferring metrics', function () {
        $series = (new BodyweightSeriesService)->series(
            ['2026-10-20' => 79.0, '2026-10-01' => 80.0],
            ['2026-10-20' => 79.4, '2026-10-10' => 79.8],
            '2026-10-05',
        );

        expect($series)->toBe([
            ['date' => '2026-10-10', 'bodyweight_kg' => 79.8, 'source' => 'workout'],
            ['date' => '2026-10-20', 'bodyweight_kg' => 79.0, 'source' => 'metric'],
        ]);
    });
});

describe('OverviewService', function () use ($today) {
    $loads = new EffectiveLoadResolver;
    $overview = new OverviewService(
        new VolumeCalculator($loads),
        new PersonalRecordsService($loads, new OneRepMaxCalculator),
        new ConsistencyService,
    );

    it('summarizes the period with recent records and every exercise with history', function () use ($overview, $today) {
        $sets = collect([
            statsSet(['workoutId' => 'a', 'date' => '2026-08-03', 'weightKg' => 90.0, 'reps' => 3]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-27', 'weightKg' => 85.0, 'reps' => 5]),
            statsSet(['workoutId' => 'b', 'date' => '2026-10-27', 'exerciseId' => 2, 'exerciseName' => 'Dominadas', 'muscleGroup' => MuscleGroup::Back, 'weightKg' => 60.0, 'reps' => 8]),
            statsSet(['workoutId' => 'c', 'date' => '2026-11-03', 'exerciseId' => 2, 'exerciseName' => 'Dominadas', 'muscleGroup' => MuscleGroup::Back, 'weightKg' => 40.0, 'reps' => 10, 'setType' => SetType::Warmup]),
        ]);

        $result = $overview->overview($sets, ['2026-08-03', '2026-10-27', '2026-11-03'], $today, '2026-10-12');

        expect($result['sessions'])->toBe(2)
            ->and($result['total_volume_kg'])->toBe(905.0)
            ->and($result['total_sets'])->toBe(2)
            ->and($result['streak_weeks'])->toBe(2)
            ->and($result['exercises'])->toBe([
                ['id' => 2, 'name' => 'Dominadas', 'sessions' => 1],
                ['id' => 1, 'name' => 'Press de banca', 'sessions' => 2],
            ])
            ->and(array_map(fn ($r) => [$r['exercise_name'], $r['type']], $result['recent_records']))->toBe([
                ['Press de banca', 'best_e1rm'],
                ['Dominadas', 'heaviest'],
                ['Dominadas', 'best_e1rm'],
            ]);
    });
});
```

Notas sobre los valores esperados: el press de banca de agosto (90 × 3) sigue siendo el récord de peso, así que no aparece como reciente; su mejor 1RM sí es de octubre (85 × 5 → 99,17 > 90 × 3 → 99). Los récords recientes van del más nuevo al más antiguo; con la misma fecha, en el orden de los ejercicios. "Dominadas" solo cuenta 1 sesión porque la del 03/11 fue solo calentamiento.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats/OverviewTest.php`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`backend/app/Services/Stats/ConsistencyService.php`:

```php
<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;

final class ConsistencyService
{
    /**
     * @param  list<string>  $workoutDates  local date of every session (one entry per session)
     * @return array{streak_weeks: int, weeks: list<array{week_start: string, sessions: int}>, days: list<array{date: string, sessions: int}>}
     */
    public function summary(array $workoutDates, CarbonImmutable $today, ?string $from): array
    {
        $todayDate = $today->toDateString();
        $perDay = array_count_values($workoutDates);
        ksort($perDay);

        $perWeek = [];
        foreach ($perDay as $date => $sessions) {
            $week = StatsCalendar::weekStart((string) $date);
            $perWeek[$week] = ($perWeek[$week] ?? 0) + $sessions;
        }

        $currentWeek = StatsCalendar::weekStart($todayDate);
        $firstWeek = match (true) {
            $from !== null => StatsCalendar::weekStart($from),
            $perDay !== [] => StatsCalendar::weekStart((string) array_key_first($perDay)),
            default => $currentWeek,
        };

        $weeks = array_map(
            fn (string $week) => ['week_start' => $week, 'sessions' => $perWeek[$week] ?? 0],
            StatsCalendar::weeks($firstWeek, $currentWeek),
        );

        $days = [];
        foreach ($perDay as $date => $sessions) {
            $date = (string) $date;
            if (($from === null || $date >= $from) && $date <= $todayDate) {
                $days[] = ['date' => $date, 'sessions' => $sessions];
            }
        }

        return ['streak_weeks' => $this->streak($workoutDates, $today), 'weeks' => $weeks, 'days' => $days];
    }

    /**
     * Consecutive weeks with at least one session, ending this week (or last week, while this one is still empty).
     *
     * @param  list<string>  $workoutDates
     */
    public function streak(array $workoutDates, CarbonImmutable $today): int
    {
        $activeWeeks = array_flip(array_map(StatsCalendar::weekStart(...), $workoutDates));

        $week = CarbonImmutable::parse(StatsCalendar::weekStart($today->toDateString()));
        if (! isset($activeWeeks[$week->toDateString()])) {
            $week = $week->subWeek();
        }

        $streak = 0;
        while (isset($activeWeeks[$week->toDateString()])) {
            $streak++;
            $week = $week->subWeek();
        }

        return $streak;
    }
}
```

`backend/app/Services/Stats/WeeklyMuscleVolumeService.php`:

```php
<?php

namespace App\Services\Stats;

use App\Enums\MuscleGroup;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class WeeklyMuscleVolumeService
{
    public function __construct(private readonly VolumeCalculator $volume) {}

    /**
     * @param  Collection<int, SetRow>  $sets
     * @return array{muscle_groups: list<string>, weeks: list<array{week_start: string, volumes: array<string, float>}>}
     */
    public function weekly(Collection $sets, CarbonImmutable $today, ?string $from, ?MuscleGroup $only = null): array
    {
        $groups = $only !== null ? [$only] : MuscleGroup::cases();
        $relevant = $sets->filter(
            fn (SetRow $set) => ($from === null || $set->date >= $from) && ($only === null || $set->muscleGroup === $only)
        );

        $currentWeek = StatsCalendar::weekStart($today->toDateString());
        $firstWeek = match (true) {
            $from !== null => StatsCalendar::weekStart($from),
            $relevant->isNotEmpty() => StatsCalendar::weekStart($relevant->min('date')),
            default => $currentWeek,
        };
        $byWeek = $relevant->groupBy(fn (SetRow $set) => StatsCalendar::weekStart($set->date));

        $weeks = array_map(function (string $week) use ($byWeek, $groups) {
            $weekSets = $byWeek->get($week, collect());
            $volumes = [];
            foreach ($groups as $group) {
                $volumes[$group->value] = $this->volume->volume(
                    $weekSets->filter(fn (SetRow $set) => $set->muscleGroup === $group)
                );
            }

            return ['week_start' => $week, 'volumes' => $volumes];
        }, StatsCalendar::weeks($firstWeek, $currentWeek));

        return ['muscle_groups' => array_map(fn (MuscleGroup $group) => $group->value, $groups), 'weeks' => $weeks];
    }
}
```

`backend/app/Services/Stats/BodyweightSeriesService.php`:

```php
<?php

namespace App\Services\Stats;

final class BodyweightSeriesService
{
    /**
     * One point per date; a logged metric wins over the bodyweight typed when finishing a session.
     *
     * @param  array<string, float>  $metrics  date => kg (body_metrics)
     * @param  array<string, float>  $workouts  date => kg (workouts.bodyweight_kg)
     * @return list<array{date: string, bodyweight_kg: float, source: string}>
     */
    public function series(array $metrics, array $workouts, ?string $from): array
    {
        $points = [];
        foreach ($workouts as $date => $kg) {
            $points[$date] = ['date' => (string) $date, 'bodyweight_kg' => $kg, 'source' => 'workout'];
        }
        foreach ($metrics as $date => $kg) {
            $points[$date] = ['date' => (string) $date, 'bodyweight_kg' => $kg, 'source' => 'metric'];
        }
        ksort($points);

        return array_values(array_filter($points, fn (array $point) => $from === null || $point['date'] >= $from));
    }
}
```

`backend/app/Services/Stats/OverviewService.php`:

```php
<?php

namespace App\Services\Stats;

use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

final class OverviewService
{
    private const RECENT_RECORDS = 5;

    public function __construct(
        private readonly VolumeCalculator $volume,
        private readonly PersonalRecordsService $records,
        private readonly ConsistencyService $consistency,
    ) {}

    /**
     * @param  Collection<int, SetRow>  $sets  every set of the user
     * @param  list<string>  $workoutDates
     * @return array<string, mixed>
     */
    public function overview(Collection $sets, array $workoutDates, CarbonImmutable $today, ?string $from): array
    {
        $inPeriod = fn (string $date) => $from === null || $date >= $from;
        $periodSets = $sets->filter(fn (SetRow $set) => $inPeriod($set->date));
        $working = $sets->reject(fn (SetRow $set) => $set->isWarmup());

        return [
            'sessions' => count(array_filter($workoutDates, $inPeriod)),
            'total_volume_kg' => $this->volume->volume($periodSets),
            'total_sets' => $periodSets->reject(fn (SetRow $set) => $set->isWarmup())->count(),
            'streak_weeks' => $this->consistency->streak($workoutDates, $today),
            'recent_records' => $this->recentRecords($sets, $inPeriod),
            'exercises' => $working
                ->groupBy('exerciseId')
                ->map(fn (Collection $exerciseSets) => [
                    'id' => $exerciseSets->first()->exerciseId,
                    'name' => $exerciseSets->first()->exerciseName,
                    'sessions' => $exerciseSets->pluck('workoutId')->unique()->count(),
                ])
                ->sortBy('name')
                ->values()
                ->all(),
        ];
    }

    /**
     * All-time records (heaviest load, best 1RM) first reached inside the period, newest first.
     *
     * @param  Collection<int, SetRow>  $sets
     * @return list<array<string, mixed>>
     */
    private function recentRecords(Collection $sets, callable $inPeriod): array
    {
        return $sets
            ->groupBy('exerciseId')
            ->flatMap(function (Collection $exerciseSets) use ($inPeriod) {
                $first = $exerciseSets->first();
                $records = $this->records->records($exerciseSets);
                $entries = [];
                foreach (['heaviest', 'best_e1rm'] as $type) {
                    $record = $records[$type];
                    if ($record !== null && $inPeriod($record['date'])) {
                        $entries[] = ['exercise_id' => $first->exerciseId, 'exercise_name' => $first->exerciseName, 'type' => $type, ...$record];
                    }
                }

                return $entries;
            })
            ->sortByDesc('date')
            ->take(self::RECENT_RECORDS)
            ->values()
            ->all();
    }
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest tests/Unit/Stats && vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(stats): add consistency, weekly muscle volume, bodyweight series and overview"
```

---

### Task 4: Peso corporal (API) y carga de datos

**Files:**
- Create: `backend/app/Http/Requests/BodyMetricRequest.php`, `ListBodyMetricsRequest.php`
- Create: `backend/app/Http/Resources/BodyMetricResource.php`
- Create: `backend/app/Http/Controllers/BodyMetricController.php`
- Create: `backend/app/Services/Stats/StatsDataLoader.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/BodyMetricsTest.php`, `backend/tests/Feature/Api/StatsDataLoaderTest.php`

**Interfaces:**
- Consumes: `SetRow`, `BodyweightTimeline` (Task 1).
- Produces:
  - `GET /api/body-metrics?from=&to=` → `{data: [{date, bodyweight_kg}]}` (fecha ascendente). `PUT /api/body-metrics/{date}` `{bodyweight_kg}` → `201`/`200`.
  - `StatsDataLoader->sets(?int $exerciseId = null): Collection<int, SetRow>` (orden: fecha, inicio, posición, número de serie), `->workoutDates(): list<string>`, `->bodyMetrics(): array<string, float>`, `->workoutBodyweights(): array<string, float>`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/BodyMetricsTest.php`:

```php
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
```

`backend/tests/Feature/Api/StatsDataLoaderTest.php`:

```php
<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;
use App\Services\Stats\SetRow;
use App\Services\Stats\StatsDataLoader;

/** Crea una sesión con un ejercicio y sus series ([kg, reps, tipo]). */
function loggedWorkout(User $user, Exercise $exercise, string $date, array $sets, ?float $bodyweight = null): Workout
{
    $workout = Workout::factory()->for($user)->create(['date' => $date, 'bodyweight_kg' => $bodyweight]);
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
    foreach ($sets as $i => [$kg, $reps, $type]) {
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $item->id, 'set_number' => $i + 1,
            'weight_kg' => $kg, 'reps' => $reps, 'set_type' => $type,
        ]);
    }

    return $workout;
}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
});

it('flattens own sets oldest first, resolving the bodyweight', function () {
    $pullUps = Exercise::factory()->for($this->user)->create([
        'name' => 'Dominadas', 'muscle_group' => MuscleGroup::Back, 'uses_bodyweight' => true, 'archived_at' => now(),
    ]);
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-01', 'bodyweight_kg' => 80]);
    loggedWorkout($this->user, $pullUps, '2026-10-08', [[5, 6, SetType::Normal]], 78.5);
    loggedWorkout($this->user, $pullUps, '2026-10-02', [[0, 8, SetType::Normal], [0, 7, SetType::Normal]]);
    loggedWorkout(User::factory()->create(), Exercise::factory()->create(), '2026-10-05', [[100, 5, SetType::Normal]]);

    $sets = app(StatsDataLoader::class)->sets();

    expect($sets)->toHaveCount(3)
        ->and($sets->first())->toBeInstanceOf(SetRow::class)
        ->and($sets->map(fn (SetRow $s) => [$s->date, $s->reps, $s->bodyweightKg])->all())->toBe([
            ['2026-10-02', 8, 80.0],
            ['2026-10-02', 7, 80.0],
            ['2026-10-08', 6, 78.5],
        ])
        ->and($sets->first()->exerciseName)->toBe('Dominadas')
        ->and($sets->first()->muscleGroup)->toBe(MuscleGroup::Back)
        ->and($sets->first()->usesBodyweight)->toBeTrue();
});

it('filters by exercise and lists session dates and bodyweights', function () {
    $bench = Exercise::factory()->for($this->user)->create();
    $row = Exercise::factory()->for($this->user)->create();
    loggedWorkout($this->user, $bench, '2026-10-01', [[100, 5, SetType::Normal]], 80.0);
    loggedWorkout($this->user, $row, '2026-10-03', [[60, 10, SetType::Normal]]);
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-02', 'bodyweight_kg' => 79.5]);

    $loader = app(StatsDataLoader::class);

    expect($loader->sets($bench->id))->toHaveCount(1)
        ->and($loader->workoutDates())->toBe(['2026-10-01', '2026-10-03'])
        ->and($loader->workoutBodyweights())->toBe(['2026-10-01' => 80.0])
        ->and($loader->bodyMetrics())->toBe(['2026-10-02' => 79.5]);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/BodyMetricsTest.php tests/Feature/Api/StatsDataLoaderTest.php`
Expected: FAIL.

- [ ] **Step 3: Peso corporal**

`backend/app/Http/Requests/BodyMetricRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BodyMetricRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** The date comes in the URL; validate it with the body. */
    protected function prepareForValidation(): void
    {
        $this->merge(['date' => $this->route('date')]);
    }

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
            'bodyweight_kg' => ['required', 'numeric', 'between:20,400'],
        ];
    }
}
```

`backend/app/Http/Requests/ListBodyMetricsRequest.php`:

```php
<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ListBodyMetricsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
        ];
    }
}
```

`backend/app/Http/Resources/BodyMetricResource.php`:

```php
<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class BodyMetricResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'date' => $this->date->toDateString(),
            'bodyweight_kg' => (float) $this->bodyweight_kg,
        ];
    }
}
```

`backend/app/Http/Controllers/BodyMetricController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\BodyMetricRequest;
use App\Http\Requests\ListBodyMetricsRequest;
use App\Http\Resources\BodyMetricResource;
use App\Models\BodyMetric;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class BodyMetricController extends Controller
{
    public function index(ListBodyMetricsRequest $request): AnonymousResourceCollection
    {
        $metrics = BodyMetric::query()
            ->when($request->validated('from'), fn ($query, string $from) => $query->whereDate('date', '>=', $from))
            ->when($request->validated('to'), fn ($query, string $to) => $query->whereDate('date', '<=', $to))
            ->orderBy('date')
            ->get();

        return BodyMetricResource::collection($metrics);
    }

    /** Create or update the bodyweight of a date (idempotent). */
    public function upsert(BodyMetricRequest $request, string $date): BodyMetricResource
    {
        $metric = BodyMetric::query()->whereDate('date', $date)->first() ?? new BodyMetric(['date' => $date]);
        $metric->bodyweight_kg = $request->validated('bodyweight_kg');
        $metric->save();

        return new BodyMetricResource($metric);
    }
}
```

En `backend/routes/api.php`, dentro de `auth:sanctum` (con su `use App\Http\Controllers\BodyMetricController;`):

```php
Route::get('/body-metrics', [BodyMetricController::class, 'index']);
Route::put('/body-metrics/{date}', [BodyMetricController::class, 'upsert']);
```

- [ ] **Step 4: Carga de datos**

`backend/app/Services/Stats/StatsDataLoader.php`:

```php
<?php

namespace App\Services\Stats;

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
     * Every set of the authenticated user (archived exercises included), oldest first.
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
            ->when($exerciseId, fn ($query) => $query->where('we.exercise_id', $exerciseId))
            ->orderBy('w.date')
            ->orderBy('w.started_at')
            ->orderBy('we.position')
            ->orderBy('s.set_number')
            ->get([
                'w.id as workout_id', 'w.date', 'w.bodyweight_kg', 'we.exercise_id', 'e.name as exercise_name',
                'e.muscle_group', 'e.uses_bodyweight', 's.set_type', 's.weight_kg', 's.reps',
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
                );
            });
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
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest && vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(api): add body metrics endpoints and stats data loader"
```

---

### Task 5: Endpoints de estadísticas

**Files:**
- Create: `backend/app/Http/Requests/StatsRequest.php`, `backend/app/Http/Controllers/StatsController.php`
- Modify: `backend/routes/api.php`
- Test: `backend/tests/Feature/Api/StatsTest.php`

**Interfaces:**
- Consumes: servicios de Tasks 1-3 y `StatsDataLoader` (Task 4).
- Produces (todas con `?period=4w|12w|6m|1y|all`, por defecto `12w`; respuesta `{data: {period, …}}`):
  - `GET /api/stats/exercises/{exercise}` → `{period, exercise: {id, name, uses_bodyweight}, sessions, records}` (404 si es ajeno).
  - `GET /api/stats/overview` → `{period, sessions, total_volume_kg, total_sets, streak_weeks, recent_records, exercises}`.
  - `GET /api/stats/weekly-volume?muscle_group=` → `{period, muscle_groups, weeks}`.
  - `GET /api/stats/consistency` → `{period, streak_weeks, weeks, days}`.
  - `GET /api/stats/bodyweight` → `{period, points}`.

- [ ] **Step 1: Escribir los tests que fallan**

`backend/tests/Feature/Api/StatsTest.php`:

```php
<?php

use App\Enums\MuscleGroup;
use App\Enums\SetType;
use App\Models\BodyMetric;
use App\Models\Exercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use App\Models\WorkoutSet;

/** Sesión con un ejercicio y series [kg, reps, tipo]. */
function statsWorkout(User $user, Exercise $exercise, string $date, array $sets, ?float $bodyweight = null): Workout
{
    $workout = Workout::factory()->for($user)->create(['date' => $date, 'bodyweight_kg' => $bodyweight]);
    $item = WorkoutExercise::factory()->create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id]);
    foreach ($sets as $i => [$kg, $reps, $type]) {
        WorkoutSet::factory()->create([
            'workout_exercise_id' => $item->id, 'set_number' => $i + 1,
            'weight_kg' => $kg, 'reps' => $reps, 'set_type' => $type,
        ]);
    }

    return $workout;
}

beforeEach(function () {
    // Domingo 08/11 a las 23:00 en Santiago (ya es lunes en UTC): la semana actual empieza el 02/11.
    $this->travelTo(new DateTimeImmutable('2026-11-09T02:00:00Z'));
    $this->user = User::factory()->create();
    $this->actingAs($this->user);
    $this->bench = Exercise::factory()->for($this->user)->create(['name' => 'Press de banca', 'muscle_group' => MuscleGroup::Chest]);
});

it('returns the progress of an exercise with its records, archived or not', function () {
    statsWorkout($this->user, $this->bench, '2026-08-03', [[90, 3, SetType::Normal]]);
    statsWorkout($this->user, $this->bench, '2026-10-26', [[40, 10, SetType::Warmup], [80, 8, SetType::Normal], [45, 31, SetType::Bilbo]]);
    $this->bench->update(['archived_at' => now()]);

    $this->getJson("/api/stats/exercises/{$this->bench->id}?period=4w")
        ->assertOk()
        ->assertJsonPath('data.period', '4w')
        ->assertJsonPath('data.exercise.name', 'Press de banca')
        ->assertJsonCount(1, 'data.sessions')
        ->assertJsonPath('data.sessions.0.date', '2026-10-26')
        ->assertJsonPath('data.sessions.0.e1rm_kg', 101.33)
        ->assertJsonPath('data.sessions.0.total_reps', 39)
        ->assertJsonPath('data.sessions.0.bilbo.0.reps', 31)
        ->assertJsonPath('data.records.heaviest.load_kg', 90.0)
        ->assertJsonPath('data.records.heaviest.date', '2026-08-03');
});

it('hides the stats of an exercise of another user', function () {
    $this->getJson('/api/stats/exercises/'.Exercise::factory()->create()->id)->assertNotFound();
});

it('validates the period', function () {
    $this->getJson('/api/stats/overview?period=2w')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['period']);
});

it('summarizes the period with only own data', function () {
    statsWorkout($this->user, $this->bench, '2026-10-27', [[100, 5, SetType::Normal]]);
    statsWorkout($this->user, $this->bench, '2026-11-08', [[80, 5, SetType::Normal]]);
    statsWorkout(User::factory()->create(), Exercise::factory()->create(), '2026-11-08', [[200, 5, SetType::Normal]]);

    $this->getJson('/api/stats/overview?period=4w')
        ->assertOk()
        ->assertJsonPath('data.sessions', 2)
        ->assertJsonPath('data.total_volume_kg', 900.0)
        ->assertJsonPath('data.total_sets', 2)
        ->assertJsonPath('data.streak_weeks', 2)
        ->assertJsonPath('data.exercises.0.name', 'Press de banca')
        ->assertJsonPath('data.recent_records.0.type', 'heaviest');
});

it('returns the weekly volume per muscle group', function () {
    statsWorkout($this->user, $this->bench, '2026-11-02', [[100, 5, SetType::Normal]]);

    $this->getJson('/api/stats/weekly-volume?period=4w')
        ->assertOk()
        ->assertJsonCount(4, 'data.weeks')
        ->assertJsonPath('data.weeks.3.week_start', '2026-11-02')
        ->assertJsonPath('data.weeks.3.volumes.chest', 500.0);

    $this->getJson('/api/stats/weekly-volume?period=4w&muscle_group=back')
        ->assertOk()
        ->assertJsonPath('data.muscle_groups', ['back'])
        ->assertJsonPath('data.weeks.3.volumes.back', 0.0);
});

it('uses the Santiago calendar for the consistency', function () {
    statsWorkout($this->user, $this->bench, '2026-11-08', [[80, 5, SetType::Normal]]);

    $this->getJson('/api/stats/consistency?period=4w')
        ->assertOk()
        ->assertJsonPath('data.streak_weeks', 1)
        ->assertJsonPath('data.weeks.3', ['week_start' => '2026-11-02', 'sessions' => 1])
        ->assertJsonPath('data.days', [['date' => '2026-11-08', 'sessions' => 1]]);
});

it('returns the bodyweight series', function () {
    BodyMetric::factory()->for($this->user)->create(['date' => '2026-10-20', 'bodyweight_kg' => 79]);
    statsWorkout($this->user, $this->bench, '2026-11-02', [[100, 5, SetType::Normal]], 78.5);

    $this->getJson('/api/stats/bodyweight?period=4w')
        ->assertOk()
        ->assertJsonPath('data.points', [
            ['date' => '2026-10-20', 'bodyweight_kg' => 79.0, 'source' => 'metric'],
            ['date' => '2026-11-02', 'bodyweight_kg' => 78.5, 'source' => 'workout'],
        ]);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd backend && ./vendor/bin/pest tests/Feature/Api/StatsTest.php`
Expected: FAIL.

- [ ] **Step 3: Request, controlador y rutas**

`backend/app/Http/Requests/StatsRequest.php`:

```php
<?php

namespace App\Http\Requests;

use App\Enums\MuscleGroup;
use App\Enums\StatsPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StatsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'period' => ['nullable', Rule::enum(StatsPeriod::class)],
            'muscle_group' => ['nullable', Rule::enum(MuscleGroup::class)],
        ];
    }

    public function period(): StatsPeriod
    {
        return StatsPeriod::from($this->validated('period') ?? StatsPeriod::TwelveWeeks->value);
    }

    /** Today in Santiago (the stats calendar). */
    public function today(): CarbonImmutable
    {
        return CarbonImmutable::now('America/Santiago')->startOfDay();
    }

    /** First local date of the period, or null for all time. */
    public function from(): ?string
    {
        return $this->period()->startDate($this->today())?->toDateString();
    }

    public function muscleGroup(): ?MuscleGroup
    {
        $value = $this->validated('muscle_group');

        return $value === null ? null : MuscleGroup::from($value);
    }
}
```

`backend/app/Http/Controllers/StatsController.php`:

```php
<?php

namespace App\Http\Controllers;

use App\Http\Requests\StatsRequest;
use App\Models\Exercise;
use App\Services\Stats\BodyweightSeriesService;
use App\Services\Stats\ConsistencyService;
use App\Services\Stats\ExerciseProgressService;
use App\Services\Stats\OverviewService;
use App\Services\Stats\StatsDataLoader;
use App\Services\Stats\WeeklyMuscleVolumeService;
use Illuminate\Http\JsonResponse;

/** Glue only: request → data loader → stats service → JSON. */
class StatsController extends Controller
{
    public function __construct(private readonly StatsDataLoader $data) {}

    public function exercise(StatsRequest $request, Exercise $exercise, ExerciseProgressService $progress): JsonResponse
    {
        return $this->respond($request, [
            'exercise' => ['id' => $exercise->id, 'name' => $exercise->name, 'uses_bodyweight' => $exercise->uses_bodyweight],
            ...$progress->progress($this->data->sets($exercise->id), $request->from()),
        ]);
    }

    public function overview(StatsRequest $request, OverviewService $overview): JsonResponse
    {
        return $this->respond($request, $overview->overview(
            $this->data->sets(), $this->data->workoutDates(), $request->today(), $request->from(),
        ));
    }

    public function weeklyVolume(StatsRequest $request, WeeklyMuscleVolumeService $weekly): JsonResponse
    {
        return $this->respond($request, $weekly->weekly(
            $this->data->sets(), $request->today(), $request->from(), $request->muscleGroup(),
        ));
    }

    public function consistency(StatsRequest $request, ConsistencyService $consistency): JsonResponse
    {
        return $this->respond($request, $consistency->summary(
            $this->data->workoutDates(), $request->today(), $request->from(),
        ));
    }

    public function bodyweight(StatsRequest $request, BodyweightSeriesService $series): JsonResponse
    {
        return $this->respond($request, [
            'points' => $series->series($this->data->bodyMetrics(), $this->data->workoutBodyweights(), $request->from()),
        ]);
    }

    /** @param array<string, mixed> $payload */
    private function respond(StatsRequest $request, array $payload): JsonResponse
    {
        return response()->json(['data' => ['period' => $request->period()->value, ...$payload]]);
    }
}
```

En `backend/routes/api.php` (con `use App\Http\Controllers\StatsController;`): dentro del grupo existente `Route::middleware('can:manage,exercise')->group(...)` agregar

```php
Route::get('/stats/exercises/{exercise}', [StatsController::class, 'exercise']);
```

y dentro de `auth:sanctum`, fuera de ese grupo:

```php
Route::get('/stats/overview', [StatsController::class, 'overview']);
Route::get('/stats/weekly-volume', [StatsController::class, 'weeklyVolume']);
Route::get('/stats/consistency', [StatsController::class, 'consistency']);
Route::get('/stats/bodyweight', [StatsController::class, 'bodyweight']);
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `cd backend && ./vendor/bin/pest && vendor/bin/pint --dirty --format agent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(api): add stats endpoints for exercises, overview, weekly volume, consistency and bodyweight"
```

---

### Task 6: ECharts, modelos, APIs y opciones de gráficos

**Files:**
- Modify: `frontend/package.json` (dependencias), `frontend/src/app/app.config.ts`
- Create: `frontend/src/app/shared/charts/echarts-setup.ts`, `chart-theme.ts`, `chart-options.ts`
- Create: `frontend/src/app/core/models/stats.ts`, `frontend/src/app/core/api/stats-api.ts`, `frontend/src/app/core/api/body-metrics-api.ts`
- Modify: `frontend/src/app/core/models/labels.ts`, `frontend/src/app/core/format/format.ts`
- Test: `frontend/src/app/shared/charts/chart-options.spec.ts`, `frontend/src/app/core/format/stats-dates.spec.ts`

**Interfaces:**
- Produces:
  - Tipos `StatsPeriod`, `HeaviestRecord`, `MostRepsRecord`, `BestE1rmRecord`, `PersonalRecords`, `ExerciseSessionStats`, `ExerciseStats`, `RecentRecord`, `StatsOverview`, `WeeklyVolume`, `Consistency`, `BodyweightPoint`, `BodyweightSeries`.
  - `StatsApi.exercise(id, period)`, `.overview(period)`, `.weeklyVolume(period)`, `.consistency(period)`, `.bodyweight(period)`; `BodyMetricsApi.save(date, kg)`.
  - `PERIOD_LABELS`, `STATS_PERIODS`; `formatShortDate(iso)` (`'03/11'`), `addDays(iso, days)`, `localToday(now?)` (fecha de Santiago).
  - `CHART`, `MUSCLE_GROUP_COLORS`, `CONSISTENCY_COLORS`; `formatChartNumber(n)`, `LinePoint`, `lineOption(points, name, unit)`, `weeklyVolumeOption(weekly)`, `heatmapRange(weeks, maxWeeks = 16)`, `consistencyOption(days, range)`.

- [ ] **Step 1: Dependencias**

```bash
cd frontend
npm install echarts@^6.1.0 ngx-echarts@^22.0.0
```

- [ ] **Step 2: Escribir los tests que fallan**

`frontend/src/app/shared/charts/chart-options.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WeeklyVolume } from '../../core/models/stats';
import { CHART, MUSCLE_GROUP_COLORS } from './chart-theme';
import { consistencyOption, heatmapRange, lineOption, weeklyVolumeOption } from './chart-options';

// Las opciones de ECharts son objetos anidados sin tipos estrictos por serie.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyOption = any;

describe('lineOption', () => {
  it('plots dated values in lime on one axis, skipping sessions without a value', () => {
    const option = lineOption(
      [
        { date: '2026-10-01', value: 100 },
        { date: '2026-10-08', value: null },
        { date: '2026-10-15', value: 105 },
      ],
      '1RM estimado',
      'kg',
    ) as AnyOption;

    expect(option.series).toHaveLength(1);
    expect(option.series[0].name).toBe('1RM estimado');
    expect(option.series[0].data).toEqual([
      ['2026-10-01', 100],
      ['2026-10-15', 105],
    ]);
    expect(option.series[0].lineStyle.color).toBe(CHART.accent);
    expect(Array.isArray(option.yAxis)).toBe(false);
  });
});

describe('weeklyVolumeOption', () => {
  const weekly: WeeklyVolume = {
    period: '4w',
    muscle_groups: ['chest', 'back', 'legs'],
    weeks: [
      { week_start: '2026-10-26', volumes: { chest: 1000, back: 0, legs: 0 } },
      { week_start: '2026-11-02', volumes: { chest: 500, back: 800, legs: 0 } },
    ],
  };

  it('stacks only the trained muscle groups, each with its fixed color', () => {
    const option = weeklyVolumeOption(weekly) as AnyOption;

    expect(option.xAxis.data).toEqual(['26/10', '02/11']);
    expect(option.series.map((s: AnyOption) => s.name)).toEqual(['Pecho', 'Espalda']);
    expect(option.series[1].data).toEqual([0, 800]);
    expect(option.series[1].itemStyle.color).toBe(MUSCLE_GROUP_COLORS.back);
    expect(option.series.every((s: AnyOption) => s.stack === 'volume')).toBe(true);
  });
});

describe('heatmapRange', () => {
  it('covers at most the last weeks, ending on sunday', () => {
    const weeks = Array.from({ length: 20 }, (_, i) => ({
      week_start: new Date(Date.UTC(2026, 5, 15 + i * 7)).toISOString().slice(0, 10),
    }));

    expect(heatmapRange(weeks, 16)).toEqual(['2026-07-13', '2026-11-01']);
    expect(heatmapRange([{ week_start: '2026-11-02' }], 16)).toEqual(['2026-11-02', '2026-11-08']);
  });
});

describe('consistencyOption', () => {
  it('maps the days to a monday-first calendar heatmap', () => {
    const option = consistencyOption([{ date: '2026-11-03', sessions: 2 }], ['2026-10-26', '2026-11-08']) as AnyOption;

    expect(option.calendar.range).toEqual(['2026-10-26', '2026-11-08']);
    expect(option.calendar.dayLabel.firstDay).toBe(1);
    expect(option.series[0].data).toEqual([['2026-11-03', 2]]);
  });
});
```

`frontend/src/app/core/format/stats-dates.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, formatShortDate, localToday } from './format';

describe('stats date helpers', () => {
  it('formats a short day/month', () => {
    expect(formatShortDate('2026-11-03')).toBe('03/11');
  });

  it('adds days across months', () => {
    expect(addDays('2026-10-26', 6)).toBe('2026-11-01');
  });

  it('gives the Santiago date, not the UTC one', () => {
    expect(localToday(new Date('2026-11-09T02:00:00Z'))).toBe('2026-11-08');
  });
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 4: Modelos, etiquetas y formatos**

`frontend/src/app/core/models/stats.ts`:

```ts
import type { MuscleGroup } from './exercise';

export type StatsPeriod = '4w' | '12w' | '6m' | '1y' | 'all';

export interface HeaviestRecord {
  load_kg: number;
  reps: number;
  date: string;
}

export interface MostRepsRecord {
  reps: number;
  load_kg: number | null;
  date: string;
}

export interface BestE1rmRecord {
  e1rm_kg: number;
  load_kg: number;
  reps: number;
  date: string;
}

export interface PersonalRecords {
  heaviest: HeaviestRecord | null;
  most_reps: MostRepsRecord | null;
  best_e1rm: BestE1rmRecord | null;
}

export interface ExerciseSessionStats {
  workout_id: string;
  date: string;
  e1rm_kg: number | null;
  best_load_kg: number | null;
  best_load_reps: number | null;
  volume_kg: number;
  total_reps: number;
  bilbo: { load_kg: number | null; reps: number }[];
}

export interface ExerciseStats {
  period: StatsPeriod;
  exercise: { id: number; name: string; uses_bodyweight: boolean };
  sessions: ExerciseSessionStats[];
  records: PersonalRecords;
}

export type RecentRecord = { exercise_id: number; exercise_name: string } & (
  | ({ type: 'heaviest' } & HeaviestRecord)
  | ({ type: 'best_e1rm' } & BestE1rmRecord)
);

export interface StatsOverview {
  period: StatsPeriod;
  sessions: number;
  total_volume_kg: number;
  total_sets: number;
  streak_weeks: number;
  recent_records: RecentRecord[];
  exercises: { id: number; name: string; sessions: number }[];
}

export interface WeeklyVolume {
  period: StatsPeriod;
  muscle_groups: MuscleGroup[];
  weeks: { week_start: string; volumes: Partial<Record<MuscleGroup, number>> }[];
}

export interface Consistency {
  period: StatsPeriod;
  streak_weeks: number;
  weeks: { week_start: string; sessions: number }[];
  days: { date: string; sessions: number }[];
}

export interface BodyweightPoint {
  date: string;
  bodyweight_kg: number;
  source: 'metric' | 'workout';
}

export interface BodyweightSeries {
  period: StatsPeriod;
  points: BodyweightPoint[];
}
```

En `frontend/src/app/core/models/labels.ts`, agregar `import type { StatsPeriod } from './stats';` y al final:

```ts
export const PERIOD_LABELS: Record<StatsPeriod, string> = {
  '4w': '4 sem',
  '12w': '12 sem',
  '6m': '6 meses',
  '1y': '1 año',
  all: 'Todo',
};

export const STATS_PERIODS = Object.keys(PERIOD_LABELS) as StatsPeriod[];
```

Al final de `frontend/src/app/core/format/format.ts`:

```ts
/** "2026-11-03" → "03/11" (ejes de gráficos). */
export function formatShortDate(isoDate: string): string {
  const [, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}`;
}

/** Suma días a una fecha "aaaa-mm-dd" (sin zona horaria). */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const santiagoDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' });

/** Fecha de hoy en Santiago como "aaaa-mm-dd". */
export function localToday(now: Date = new Date()): string {
  return santiagoDate.format(now);
}
```

- [ ] **Step 5: APIs**

`frontend/src/app/core/api/stats-api.ts`:

```ts
import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  BodyweightSeries,
  Consistency,
  ExerciseStats,
  StatsOverview,
  StatsPeriod,
  WeeklyVolume,
} from '../models/stats';

@Injectable({ providedIn: 'root' })
export class StatsApi {
  private readonly http = inject(HttpClient);

  exercise(id: number, period: StatsPeriod): Promise<ExerciseStats> {
    return this.get(`/api/stats/exercises/${id}`, period);
  }

  overview(period: StatsPeriod): Promise<StatsOverview> {
    return this.get('/api/stats/overview', period);
  }

  weeklyVolume(period: StatsPeriod): Promise<WeeklyVolume> {
    return this.get('/api/stats/weekly-volume', period);
  }

  consistency(period: StatsPeriod): Promise<Consistency> {
    return this.get('/api/stats/consistency', period);
  }

  bodyweight(period: StatsPeriod): Promise<BodyweightSeries> {
    return this.get('/api/stats/bodyweight', period);
  }

  private async get<T>(url: string, period: StatsPeriod): Promise<T> {
    const params = new HttpParams().set('period', period);
    return (await firstValueFrom(this.http.get<{ data: T }>(url, { params }))).data;
  }
}
```

`frontend/src/app/core/api/body-metrics-api.ts`:

```ts
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class BodyMetricsApi {
  private readonly http = inject(HttpClient);

  /** Guarda (o corrige) el peso corporal de una fecha "aaaa-mm-dd". */
  async save(date: string, bodyweightKg: number): Promise<void> {
    await firstValueFrom(this.http.put(`/api/body-metrics/${date}`, { bodyweight_kg: bodyweightKg }));
  }
}
```

- [ ] **Step 6: ECharts y opciones**

`frontend/src/app/shared/charts/echarts-setup.ts`:

```ts
import { BarChart, HeatmapChart, LineChart } from 'echarts/charts';
import {
  CalendarComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

// Solo lo que usamos: el chunk de gráficos se carga recién al abrir Estadísticas.
echarts.use([
  LineChart,
  BarChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  CalendarComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export default echarts;
```

En `frontend/src/app/app.config.ts`: `import { provideEchartsCore } from 'ngx-echarts';` y agregar a `providers`:

```ts
provideEchartsCore({ echarts: () => import('./shared/charts/echarts-setup').then((m) => m.default) }),
```

`frontend/src/app/shared/charts/chart-theme.ts`:

```ts
import type { MuscleGroup } from '../../core/models/exercise';

/** Tinta y superficie de los gráficos (dirección visual "Pista"). */
export const CHART = {
  surface: '#181a15',
  grid: '#2a2d25',
  axis: '#9ba192',
  ink: '#f2f4ec',
  accent: '#c8f135',
  font: "'Barlow', sans-serif",
  numberFont: "'Barlow Condensed', sans-serif",
} as const;

/**
 * Paleta categórica validada (skill dataviz, script validate_palette) sobre #181a15:
 * banda de luminosidad, croma, separación para daltonismo y contraste en PASS.
 * Orden fijo por grupo (el color sigue al grupo, nunca a su posición); "otro" en gris.
 */
export const MUSCLE_GROUP_COLORS: Record<MuscleGroup, string> = {
  chest: '#3987e5',
  back: '#d95926',
  shoulders: '#199e70',
  biceps: '#c98500',
  triceps: '#d55181',
  legs: '#008300',
  core: '#9085e9',
  other: '#7a7f72',
};

/** Rampa secuencial de un solo tono (lima): sin sesión → 1 sesión → 2 o más. */
export const CONSISTENCY_COLORS = ['#20231c', '#6f8f23', '#c8f135'] as const;
```

`frontend/src/app/shared/charts/chart-options.ts`:

```ts
import type { EChartsCoreOption } from 'echarts/core';
import { addDays, formatDate, formatShortDate } from '../../core/format/format';
import { MUSCLE_GROUP_LABELS } from '../../core/models/labels';
import type { Consistency, WeeklyVolume } from '../../core/models/stats';
import { CHART, CONSISTENCY_COLORS, MUSCLE_GROUP_COLORS } from './chart-theme';

const numberFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });

export function formatChartNumber(value: number): string {
  return numberFormatter.format(value);
}

const axisLabel = { color: CHART.axis, fontFamily: CHART.numberFont, fontSize: 13 };
const axisBase = {
  axisLine: { lineStyle: { color: CHART.grid } },
  axisTick: { show: false },
  axisLabel,
  splitLine: { lineStyle: { color: CHART.grid } },
};
const tooltipBase = {
  backgroundColor: CHART.surface,
  borderColor: CHART.grid,
  textStyle: { color: CHART.ink, fontFamily: CHART.font },
};

export interface LinePoint {
  date: string;
  value: number | null;
}

/** Una serie en el tiempo (un solo eje): línea lima de 2 px, puntos con anillo y el último valor rotulado. */
export function lineOption(points: LinePoint[], name: string, unit: string): EChartsCoreOption {
  const data = points.filter((p) => p.value !== null).map((p) => [p.date, p.value as number]);

  return {
    animationDuration: 300,
    grid: { left: 8, right: 56, top: 16, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: CHART.axis } },
      formatter: (params: unknown) => {
        const [point] = params as { value: [string, number] }[];
        return `${formatDate(point.value[0])}<br><b>${formatChartNumber(point.value[1])} ${unit}</b>`;
      },
    },
    xAxis: { type: 'time', ...axisBase, splitLine: { show: false }, axisLabel: { ...axisLabel, formatter: '{dd}/{MM}' } },
    yAxis: { type: 'value', scale: true, ...axisBase, axisLabel: { ...axisLabel, formatter: formatChartNumber } },
    series: [
      {
        name,
        type: 'line',
        data,
        showSymbol: data.length <= 30,
        symbol: 'circle',
        symbolSize: 8,
        lineStyle: { width: 2, color: CHART.accent },
        itemStyle: { color: CHART.accent, borderColor: CHART.surface, borderWidth: 2 },
        endLabel: {
          show: data.length > 0,
          color: CHART.ink,
          fontFamily: CHART.numberFont,
          fontSize: 15,
          formatter: (p: { value: [string, number] }) => formatChartNumber(p.value[1]),
        },
      },
    ],
  };
}

/** Barras apiladas de volumen semanal; solo los grupos entrenados, cada uno con su color fijo. */
export function weeklyVolumeOption(weekly: WeeklyVolume): EChartsCoreOption {
  const active = weekly.muscle_groups.filter((group) => weekly.weeks.some((w) => (w.volumes[group] ?? 0) > 0));

  return {
    animationDuration: 300,
    legend: {
      top: 0,
      left: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: CHART.axis, fontFamily: CHART.font },
    },
    grid: { left: 8, right: 8, top: 56, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (value: unknown) => `${formatChartNumber(Number(value))} kg`,
    },
    xAxis: {
      type: 'category',
      data: weekly.weeks.map((w) => formatShortDate(w.week_start)),
      ...axisBase,
      splitLine: { show: false },
    },
    yAxis: { type: 'value', ...axisBase, axisLabel: { ...axisLabel, formatter: formatChartNumber } },
    series: active.map((group) => ({
      name: MUSCLE_GROUP_LABELS[group],
      type: 'bar',
      stack: 'volume',
      barMaxWidth: 28,
      emphasis: { focus: 'series' },
      itemStyle: { color: MUSCLE_GROUP_COLORS[group], borderColor: CHART.surface, borderWidth: 1 },
      data: weekly.weeks.map((w) => w.volumes[group] ?? 0),
    })),
  };
}

/** Rango del calendario: las últimas `maxWeeks` semanas del período (caben en un teléfono). */
export function heatmapRange(weeks: { week_start: string }[], maxWeeks = 16): [string, string] {
  const first = weeks.at(-maxWeeks) ?? weeks[0];
  const last = weeks.at(-1)!;
  return [first.week_start, addDays(last.week_start, 6)];
}

/** Calendario de constancia: una celda por día, más brillante con más sesiones. */
export function consistencyOption(days: Consistency['days'], range: [string, string]): EChartsCoreOption {
  return {
    animationDuration: 300,
    tooltip: {
      ...tooltipBase,
      formatter: (params: unknown) => {
        const [date, sessions] = (params as { value: [string, number] }).value;
        return `${formatDate(date)}<br><b>${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'}</b>`;
      },
    },
    visualMap: {
      show: false,
      type: 'piecewise',
      pieces: [
        { value: 1, color: CONSISTENCY_COLORS[1] },
        { min: 2, color: CONSISTENCY_COLORS[2] },
      ],
    },
    calendar: {
      range,
      top: 24,
      left: 24,
      right: 4,
      bottom: 4,
      cellSize: ['auto', 18],
      splitLine: { show: false },
      itemStyle: { color: CONSISTENCY_COLORS[0], borderColor: CHART.surface, borderWidth: 3 },
      dayLabel: {
        firstDay: 1,
        nameMap: ['D', 'L', 'M', 'M', 'J', 'V', 'S'],
        color: CHART.axis,
        fontFamily: CHART.font,
      },
      monthLabel: {
        nameMap: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
        color: CHART.axis,
        fontFamily: CHART.font,
      },
      yearLabel: { show: false },
    },
    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: days.map((d) => [d.date, d.sessions]) }],
  };
}
```

- [ ] **Step 7: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores.

- [ ] **Step 8: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add stats models, APIs and ECharts option builders"
```

---

### Task 7: Pantalla de estadísticas generales

**Files:**
- Create: `frontend/src/app/shared/ui/chip-group.ts`, `frontend/src/app/features/stats/format-record.ts`
- Modify: `frontend/src/app/features/stats/stats-page.ts` (reemplazar)
- Test: `frontend/src/app/shared/ui/chip-group.spec.ts`, `frontend/src/app/features/stats/format-record.spec.ts`

**Interfaces:**
- Consumes: Task 6, `cachedFetch`, `LOCAL_DB`, `parseDecimal` (`core/workout/set-suggestions`), `formatKg`, `formatDate`, `apiErrorMessage`.
- Produces:
  - `<app-chip-group [options] [value] (valueChange) label>`: fila de chips (radiogroup) con objetivos de 48 px; `options: readonly ChipOption[]`, `ChipOption = {value: string; label: string}`; `value` es un `model.required<string>()`.
  - `formatHeaviest(r)`, `formatBestE1rm(r)`, `formatMostReps(r)`, `formatRecentRecord(r)`.

- [ ] **Step 1: Escribir los tests que fallan**

`frontend/src/app/shared/ui/chip-group.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ChipGroup } from './chip-group';

describe('ChipGroup', () => {
  it('marks the selected chip and updates the value on click', async () => {
    const fixture = TestBed.createComponent(ChipGroup);
    fixture.componentRef.setInput('options', [
      { value: '4w', label: '4 sem' },
      { value: '12w', label: '12 sem' },
    ]);
    fixture.componentRef.setInput('value', '12w');
    fixture.componentRef.setInput('label', 'Período');
    await fixture.whenStable();

    const [first, second] = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(second.getAttribute('aria-checked')).toBe('true');

    first.click();
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('4w');
    expect(first.getAttribute('aria-checked')).toBe('true');
  });
});
```

`frontend/src/app/features/stats/format-record.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBestE1rm, formatHeaviest, formatMostReps, formatRecentRecord } from './format-record';

describe('record formatting', () => {
  it('describes each record in spanish', () => {
    expect(formatHeaviest({ load_kg: 90, reps: 3, date: '2026-10-08' })).toBe('90 kg × 3');
    expect(formatBestE1rm({ e1rm_kg: 116.67, load_kg: 100, reps: 5, date: '2026-10-08' })).toBe('116,67 kg (100 kg × 5)');
    expect(formatMostReps({ reps: 31, load_kg: 42.5, date: '2026-10-08' })).toBe('31 reps con 42,5 kg');
    expect(formatMostReps({ reps: 8, load_kg: null, date: '2026-10-08' })).toBe('8 reps');
  });

  it('describes a recent record with its kind', () => {
    expect(
      formatRecentRecord({ exercise_id: 1, exercise_name: 'Press', type: 'heaviest', load_kg: 90, reps: 3, date: '2026-10-08' }),
    ).toBe('Récord de peso: 90 kg × 3');
    expect(
      formatRecentRecord({
        exercise_id: 1,
        exercise_name: 'Press',
        type: 'best_e1rm',
        e1rm_kg: 99.17,
        load_kg: 85,
        reps: 5,
        date: '2026-10-08',
      }),
    ).toBe('Mejor 1RM estimado: 99,17 kg (85 kg × 5)');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Chips y formatos**

`frontend/src/app/shared/ui/chip-group.ts`:

```ts
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface ChipOption {
  value: string;
  label: string;
}

/** Fila de chips de selección única (período, métrica): el elegido en lima, objetivos de 48 px. */
@Component({
  selector: 'app-chip-group',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="radiogroup" [attr.aria-label]="label()">
      @for (option of options(); track option.value) {
        <button
          type="button"
          role="radio"
          class="num h-12 shrink-0 rounded-full border px-4 text-lg font-semibold tracking-wide uppercase"
          [attr.aria-checked]="option.value === value()"
          [class.bg-primary]="option.value === value()"
          [class.border-primary]="option.value === value()"
          [class.text-primary-foreground]="option.value === value()"
          [class.border-border]="option.value !== value()"
          [class.text-muted-foreground]="option.value !== value()"
          (click)="value.set(option.value)"
        >
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class ChipGroup {
  readonly options = input.required<readonly ChipOption[]>();
  readonly value = model.required<string>();
  readonly label = input.required<string>();
}
```

`frontend/src/app/features/stats/format-record.ts`:

```ts
import { formatKg } from '../../core/format/format';
import type { BestE1rmRecord, HeaviestRecord, MostRepsRecord, RecentRecord } from '../../core/models/stats';

export function formatHeaviest(record: HeaviestRecord): string {
  return `${formatKg(record.load_kg)} × ${record.reps}`;
}

export function formatBestE1rm(record: BestE1rmRecord): string {
  return `${formatKg(record.e1rm_kg)} (${formatKg(record.load_kg)} × ${record.reps})`;
}

export function formatMostReps(record: MostRepsRecord): string {
  return record.load_kg === null ? `${record.reps} reps` : `${record.reps} reps con ${formatKg(record.load_kg)}`;
}

export function formatRecentRecord(record: RecentRecord): string {
  return record.type === 'heaviest'
    ? `Récord de peso: ${formatHeaviest(record)}`
    : `Mejor 1RM estimado: ${formatBestE1rm(record)}`;
}
```

- [ ] **Step 4: Página**

`frontend/src/app/features/stats/stats-page.ts` (reemplazar):

```ts
import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight, lucideTrophy } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmInput } from '@spartan-ng/helm/input';
import { NgxEchartsDirective } from 'ngx-echarts';
import { apiErrorMessage } from '../../core/api/api-error';
import { BodyMetricsApi } from '../../core/api/body-metrics-api';
import { StatsApi } from '../../core/api/stats-api';
import { formatDate, formatKg, localToday } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { PERIOD_LABELS, STATS_PERIODS } from '../../core/models/labels';
import type { StatsPeriod } from '../../core/models/stats';
import { parseDecimal } from '../../core/workout/set-suggestions';
import { consistencyOption, heatmapRange, lineOption, weeklyVolumeOption } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';
import { formatRecentRecord } from './format-record';

@Component({
  selector: 'app-stats-page',
  imports: [RouterLink, NgIcon, HlmButton, HlmInput, NgxEchartsDirective, ChipGroup],
  providers: [provideIcons({ lucideChevronRight, lucideTrophy })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="page-title mb-4">Estadísticas</h1>
    <app-chip-group
      class="mb-5 block"
      label="Período"
      [options]="periodOptions"
      [value]="period()"
      (valueChange)="period.set($any($event))"
    />

    @if (overview.value(); as o) {
      <dl class="mb-6 grid grid-cols-2 gap-3">
        <div class="card p-4">
          <dt class="eyebrow">Sesiones</dt>
          <dd class="num text-4xl font-bold text-primary">{{ o.sessions }}</dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Racha</dt>
          <dd class="num text-4xl font-bold">
            {{ o.streak_weeks }}<span class="ml-1 text-base text-muted-foreground"> sem</span>
          </dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Volumen</dt>
          <dd class="num text-3xl font-bold">{{ formatKg(o.total_volume_kg) }}</dd>
        </div>
        <div class="card p-4">
          <dt class="eyebrow">Series</dt>
          <dd class="num text-3xl font-bold">{{ o.total_sets }}</dd>
        </div>
      </dl>

      @if (o.recent_records.length) {
        <section class="mb-6">
          <h2 class="section-title mb-3">Récords recientes</h2>
          <ul class="flex flex-col gap-2">
            @for (r of o.recent_records; track r.exercise_id + r.type) {
              <li class="card flex items-center gap-3 p-4">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <ng-icon name="lucideTrophy" size="20" aria-hidden="true" />
                </span>
                <div class="min-w-0">
                  <p class="font-semibold">{{ r.exercise_name }}</p>
                  <p class="num text-base text-muted-foreground">
                    {{ formatRecentRecord(r) }} · {{ formatDate(r.date) }}
                  </p>
                </div>
              </li>
            }
          </ul>
        </section>
      }
    } @else if (overview.error()) {
      <p class="mb-4 text-destructive">No se pudieron cargar las estadísticas.</p>
    }

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-2">Volumen semanal por grupo</h2>
      @if (weeklyChart(); as option) {
        <div echarts [options]="option" class="h-64" role="img" aria-label="Volumen semanal por grupo muscular, en kg"></div>
      } @else {
        <p class="text-sm text-muted-foreground">Sin series en este período.</p>
      }
    </section>

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-1">Constancia</h2>
      @if (consistency.value(); as c) {
        <p class="mb-2 text-sm text-muted-foreground">
          Últimas semanas · {{ c.days.length }} {{ c.days.length === 1 ? 'día entrenado' : 'días entrenados' }} en el período
        </p>
        @if (consistencyChart(); as option) {
          <div echarts [options]="option" class="h-44" role="img" aria-label="Calendario de días entrenados"></div>
        }
      }
    </section>

    <section class="card mb-6 p-4">
      <h2 class="section-title mb-2">Peso corporal</h2>
      @if (bodyweightChart(); as option) {
        <div echarts [options]="option" class="h-48" role="img" aria-label="Peso corporal en el tiempo, en kg"></div>
      } @else {
        <p class="mb-2 text-sm text-muted-foreground">Todavía no hay registros de peso en este período.</p>
      }
      <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); saveBodyweight(bw)">
        <label class="sr-only" for="bodyweight">Peso de hoy (kg)</label>
        <input
          hlmInput
          id="bodyweight"
          #bw
          class="num h-12 flex-1 text-xl"
          inputmode="decimal"
          placeholder="Peso de hoy, ej.: 78,5"
        />
        <button hlmBtn type="submit" class="h-12" [disabled]="savingWeight()">Guardar</button>
      </form>
      @if (weightError()) {
        <p class="mt-2 text-sm text-destructive" role="alert">{{ weightError() }}</p>
      }
    </section>

    @if (overview.value()?.exercises?.length) {
      <section>
        <h2 class="section-title mb-3">Por ejercicio</h2>
        <ul class="flex flex-col gap-2">
          @for (e of overview.value()!.exercises; track e.id) {
            <li>
              <a [routerLink]="['/estadisticas/ejercicios', e.id]" class="card flex items-center gap-3 p-4">
                <span class="flex-1 font-medium">{{ e.name }}</span>
                <span class="num text-base text-muted-foreground">
                  {{ e.sessions }} {{ e.sessions === 1 ? 'sesión' : 'sesiones' }}
                </span>
                <ng-icon name="lucideChevronRight" size="20" class="text-muted-foreground" />
              </a>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class StatsPage {
  private readonly api = inject(StatsApi);
  private readonly bodyMetrics = inject(BodyMetricsApi);
  private readonly db = inject(LOCAL_DB);

  protected readonly formatKg = formatKg;
  protected readonly formatDate = formatDate;
  protected readonly formatRecentRecord = formatRecentRecord;
  protected readonly periodOptions = STATS_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));

  protected readonly period = signal<StatsPeriod>('12w');
  protected readonly savingWeight = signal(false);
  protected readonly weightError = signal<string | null>(null);

  protected readonly overview = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:overview:${params}`, () => this.api.overview(params)),
  });
  protected readonly weekly = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:weekly:${params}`, () => this.api.weeklyVolume(params)),
  });
  protected readonly consistency = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:consistency:${params}`, () => this.api.consistency(params)),
  });
  protected readonly bodyweight = resource({
    params: () => this.period(),
    loader: ({ params }) => cachedFetch(this.db, `stats:bodyweight:${params}`, () => this.api.bodyweight(params)),
  });

  protected readonly weeklyChart = computed(() => {
    const weekly = this.weekly.value();
    const trained = weekly?.weeks.some((w) => Object.values(w.volumes).some((v) => (v ?? 0) > 0));
    return weekly && trained ? weeklyVolumeOption(weekly) : null;
  });
  protected readonly consistencyChart = computed(() => {
    const c = this.consistency.value();
    return c && c.weeks.length ? consistencyOption(c.days, heatmapRange(c.weeks)) : null;
  });
  protected readonly bodyweightChart = computed(() => {
    const points = this.bodyweight.value()?.points ?? [];
    return points.length
      ? lineOption(points.map((p) => ({ date: p.date, value: p.bodyweight_kg })), 'Peso corporal', 'kg')
      : null;
  });

  protected async saveBodyweight(input: HTMLInputElement): Promise<void> {
    const kg = parseDecimal(input.value, 0);
    if (!kg) {
      this.weightError.set('Ingresa tu peso en kg, por ejemplo 78,5.');
      return;
    }
    this.savingWeight.set(true);
    this.weightError.set(null);
    try {
      await this.bodyMetrics.save(localToday(), kg);
      input.value = '';
      this.bodyweight.reload();
    } catch (e) {
      this.weightError.set(apiErrorMessage(e));
    } finally {
      this.savingWeight.set(false);
    }
  }
}
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores; en la salida del build aparece un chunk perezoso con echarts.

- [ ] **Step 6: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add stats overview with records, weekly volume, consistency and bodyweight charts"
```

---

### Task 8: Estadísticas por ejercicio

**Files:**
- Create: `frontend/src/app/features/stats/exercise-stats-page.ts`
- Modify: `frontend/src/app/app.routes.ts`, `frontend/src/app/features/exercises/exercise-detail-page.ts`
- Test: `frontend/src/app/features/stats/exercise-stats-page.spec.ts`

**Interfaces:**
- Consumes: Tasks 6-7.
- Produces: ruta `/estadisticas/ejercicios/:id`; exporta `EXERCISE_METRICS` y `bilboPoints(sessions): LinePoint[]`.

- [ ] **Step 1: Escribir el test que falla**

`frontend/src/app/features/stats/exercise-stats-page.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ExerciseSessionStats } from '../../core/models/stats';
import { EXERCISE_METRICS, bilboPoints } from './exercise-stats-page';

const session = (date: string, bilbo: ExerciseSessionStats['bilbo']): ExerciseSessionStats => ({
  workout_id: date,
  date,
  e1rm_kg: null,
  best_load_kg: null,
  best_load_reps: null,
  volume_kg: 0,
  total_reps: 0,
  bilbo,
});

describe('exercise stats helpers', () => {
  it('offers the four metrics of the spec, one at a time', () => {
    expect(EXERCISE_METRICS.map((m) => m.label)).toEqual(['1RM estimado', 'Mejor peso', 'Volumen', 'Reps totales']);
  });

  it('takes the best bilbo set of each session that had one', () => {
    expect(
      bilboPoints([
        session('2026-10-01', [
          { load_kg: 42.5, reps: 30 },
          { load_kg: 42.5, reps: 28 },
        ]),
        session('2026-10-08', []),
        session('2026-10-15', [{ load_kg: 45, reps: 31 }]),
      ]),
    ).toEqual([
      { date: '2026-10-01', value: 30 },
      { date: '2026-10-15', value: 31 },
    ]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `cd frontend && npx ng test --watch=false`
Expected: FAIL.

- [ ] **Step 3: Página**

`frontend/src/app/features/stats/exercise-stats-page.ts`:

```ts
import { ChangeDetectionStrategy, Component, computed, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft } from '@ng-icons/lucide';
import { NgxEchartsDirective } from 'ngx-echarts';
import { StatsApi } from '../../core/api/stats-api';
import { formatDate, formatKg } from '../../core/format/format';
import { cachedFetch } from '../../core/local-db/cached-fetch';
import { LOCAL_DB } from '../../core/local-db/local-db';
import { PERIOD_LABELS, STATS_PERIODS } from '../../core/models/labels';
import type { ExerciseSessionStats, StatsPeriod } from '../../core/models/stats';
import { lineOption, type LinePoint } from '../../shared/charts/chart-options';
import { ChipGroup } from '../../shared/ui/chip-group';
import { formatBestE1rm, formatHeaviest, formatMostReps } from './format-record';

type MetricKey = 'e1rm_kg' | 'best_load_kg' | 'volume_kg' | 'total_reps';

/** Una métrica por gráfico (nunca dos ejes): se cambia con los chips. */
export const EXERCISE_METRICS: readonly { key: MetricKey; label: string; unit: string }[] = [
  { key: 'e1rm_kg', label: '1RM estimado', unit: 'kg' },
  { key: 'best_load_kg', label: 'Mejor peso', unit: 'kg' },
  { key: 'volume_kg', label: 'Volumen', unit: 'kg' },
  { key: 'total_reps', label: 'Reps totales', unit: 'reps' },
];

/** Mejor serie Bilbo (más reps) de cada sesión que tuvo Bilbo. */
export function bilboPoints(sessions: ExerciseSessionStats[]): LinePoint[] {
  return sessions
    .filter((s) => s.bilbo.length > 0)
    .map((s) => ({ date: s.date, value: Math.max(...s.bilbo.map((b) => b.reps)) }));
}

@Component({
  selector: 'app-exercise-stats-page',
  imports: [RouterLink, NgIcon, NgxEchartsDirective, ChipGroup],
  providers: [provideIcons({ lucideChevronLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="mb-4 flex items-center gap-3">
      <a
        routerLink="/estadisticas"
        class="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"
        aria-label="Volver a Estadísticas"
      >
        <ng-icon name="lucideChevronLeft" size="22" />
      </a>
      <div class="min-w-0">
        <p class="eyebrow">Estadísticas</p>
        <h1 class="page-title truncate">{{ stats.value()?.exercise?.name ?? '…' }}</h1>
      </div>
    </header>

    <app-chip-group
      class="mb-4 block"
      label="Período"
      [options]="periodOptions"
      [value]="period()"
      (valueChange)="period.set($any($event))"
    />

    @if (stats.value(); as s) {
      <div class="mb-6 grid grid-cols-2 gap-2">
        <div class="card col-span-2 p-4">
          <p class="eyebrow">Mejor 1RM estimado</p>
          <p class="num text-2xl font-bold text-primary">
            {{ s.records.best_e1rm ? formatBestE1rm(s.records.best_e1rm) : '—' }}
          </p>
          @if (s.records.best_e1rm) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.best_e1rm.date) }}</p>
          }
        </div>
        <div class="card p-4">
          <p class="eyebrow">Récord de peso</p>
          <p class="num text-xl font-bold">{{ s.records.heaviest ? formatHeaviest(s.records.heaviest) : '—' }}</p>
          @if (s.records.heaviest) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.heaviest.date) }}</p>
          }
        </div>
        <div class="card p-4">
          <p class="eyebrow">Más reps</p>
          <p class="num text-xl font-bold">{{ s.records.most_reps ? formatMostReps(s.records.most_reps) : '—' }}</p>
          @if (s.records.most_reps) {
            <p class="text-xs text-muted-foreground">{{ formatDate(s.records.most_reps.date) }}</p>
          }
        </div>
      </div>

      <section class="card mb-6 p-4">
        <app-chip-group
          class="mb-3 block"
          label="Métrica"
          [options]="metricOptions"
          [value]="metric()"
          (valueChange)="metric.set($any($event))"
        />
        @if (chart(); as option) {
          <div echarts [options]="option" class="h-60" role="img" [attr.aria-label]="metricLabel() + ' por sesión'"></div>
        } @else {
          <p class="text-sm text-muted-foreground">Sin sesiones en este período.</p>
        }
      </section>

      @if (bilboChart(); as option) {
        <section class="card mb-6 p-4">
          <h2 class="section-title mb-2">Series Bilbo</h2>
          <div echarts [options]="option" class="h-48" role="img" aria-label="Reps de la mejor serie Bilbo por sesión"></div>
        </section>
      }

      @if (s.sessions.length) {
        <section class="mb-6">
          <h2 class="section-title mb-3">Sesiones</h2>
          <div class="card overflow-x-auto">
            <table class="w-full text-left text-sm">
              <thead class="eyebrow">
                <tr>
                  <th class="px-3 py-2 font-medium">Fecha</th>
                  <th class="px-3 py-2 text-right font-medium">1RM est.</th>
                  <th class="px-3 py-2 text-right font-medium">Mejor serie</th>
                  <th class="px-3 py-2 text-right font-medium">Volumen</th>
                  <th class="px-3 py-2 text-right font-medium">Reps</th>
                </tr>
              </thead>
              <tbody class="num text-base">
                @for (row of sessionsNewestFirst(); track row.workout_id) {
                  <tr class="border-t border-border">
                    <td class="px-3 py-2">{{ formatDate(row.date) }}</td>
                    <td class="px-3 py-2 text-right">{{ row.e1rm_kg === null ? '—' : formatKg(row.e1rm_kg) }}</td>
                    <td class="px-3 py-2 text-right">
                      {{ row.best_load_kg === null ? '—' : formatKg(row.best_load_kg) + ' × ' + row.best_load_reps }}
                    </td>
                    <td class="px-3 py-2 text-right">{{ formatKg(row.volume_kg) }}</td>
                    <td class="px-3 py-2 text-right">{{ row.total_reps }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }
    } @else if (stats.error()) {
      <p class="text-destructive">No se pudieron cargar las estadísticas de este ejercicio.</p>
    } @else {
      <p class="text-muted-foreground">Cargando…</p>
    }
  `,
})
export class ExerciseStatsPage {
  private readonly api = inject(StatsApi);
  private readonly db = inject(LOCAL_DB);

  readonly id = input.required<string>();

  protected readonly formatKg = formatKg;
  protected readonly formatDate = formatDate;
  protected readonly formatHeaviest = formatHeaviest;
  protected readonly formatBestE1rm = formatBestE1rm;
  protected readonly formatMostReps = formatMostReps;
  protected readonly periodOptions = STATS_PERIODS.map((value) => ({ value, label: PERIOD_LABELS[value] }));
  protected readonly metricOptions = EXERCISE_METRICS.map((m) => ({ value: m.key, label: m.label }));

  protected readonly period = signal<StatsPeriod>('12w');
  protected readonly metric = signal<MetricKey>('e1rm_kg');
  protected readonly metricLabel = computed(() => EXERCISE_METRICS.find((m) => m.key === this.metric())!.label);

  protected readonly stats = resource({
    params: () => ({ id: Number(this.id()), period: this.period() }),
    loader: ({ params }) =>
      cachedFetch(this.db, `stats:exercise:${params.id}:${params.period}`, () =>
        this.api.exercise(params.id, params.period),
      ),
  });

  protected readonly chart = computed(() => {
    const sessions = this.stats.value()?.sessions ?? [];
    const metric = EXERCISE_METRICS.find((m) => m.key === this.metric())!;
    const points = sessions.map((s) => ({ date: s.date, value: s[metric.key] }));
    return points.some((p) => p.value !== null) ? lineOption(points, metric.label, metric.unit) : null;
  });

  protected readonly bilboChart = computed(() => {
    const points = bilboPoints(this.stats.value()?.sessions ?? []);
    return points.length ? lineOption(points, 'Reps Bilbo', 'reps') : null;
  });

  protected readonly sessionsNewestFirst = computed(() => [...(this.stats.value()?.sessions ?? [])].reverse());
}
```

- [ ] **Step 4: Rutas y enlace**

En `frontend/src/app/app.routes.ts`, reemplazar la ruta de `estadisticas` por:

```ts
{
  path: 'estadisticas',
  title: 'Estadísticas · GymTracker',
  children: [
    { path: '', loadComponent: () => import('./features/stats/stats-page').then((m) => m.StatsPage) },
    {
      path: 'ejercicios/:id',
      loadComponent: () => import('./features/stats/exercise-stats-page').then((m) => m.ExerciseStatsPage),
    },
  ],
},
```

En `frontend/src/app/features/exercises/exercise-detail-page.ts`, dentro de `<div class="mb-6 grid grid-cols-2 gap-3">`, como primer elemento:

```html
<a hlmBtn class="col-span-2 h-12" [routerLink]="['/estadisticas/ejercicios', ex.id]">Ver estadísticas</a>
```

- [ ] **Step 5: Correr y verificar que pasan**

Run: `cd frontend && npx ng test --watch=false && npx ng build`
Expected: PASS y build sin errores.

- [ ] **Step 6: Commit**

```bash
cd /home/luciano/Proyecto_Gym_Tracker
git add frontend
git commit -m "feat(frontend): add per-exercise stats with metric switcher, records, bilbo chart and sessions table"
```

---

### Task 9: Verificación de punta a punta

- [ ] **Step 1: Suites completas**

Run: `(cd backend && ./vendor/bin/pest) && (cd frontend && npx ng test --watch=false && npx ng build)`
Expected: todo PASS.

- [ ] **Step 2: API real vía proxy (Postgres)**

Con sesión iniciada por curl (como en la fase 3, sin `migrate:fresh`): anotar el peso de hoy si existe (`GET /api/body-metrics?from={hoy}&to={hoy}`); crear una sesión de prueba de Press de banca con dos series (`PUT` workout, workout-exercise, sets); verificar `GET /api/stats/exercises/{id}?period=4w` (la sesión aparece con `e1rm_kg`), `GET /api/stats/overview?period=4w`, `GET /api/stats/weekly-volume?period=4w`, `GET /api/stats/consistency?period=4w`; `PUT /api/body-metrics/{hoy}` y `GET /api/stats/bodyweight?period=4w`. Al final borrar la sesión de prueba y restaurar el peso de hoy anotado (si no había, dejar constancia y avisar al usuario, porque no hay endpoint para borrarlo).

- [ ] **Step 3: Verificación manual (usuario, vista móvil)**

1. "Estadísticas": tarjetas de Sesiones, Racha, Volumen y Series; cambiar el período con los chips actualiza todo.
2. Récords recientes con trofeo lima; "Volumen semanal por grupo" con barras apiladas y leyenda; "Constancia" con el calendario; "Peso corporal": guardar el peso de hoy y ver el punto nuevo.
3. "Por ejercicio" → un ejercicio: tarjetas de récords, gráfico con los chips 1RM / Mejor peso / Volumen / Reps, gráfico Bilbo si corresponde y la tabla de sesiones.
4. "Ejercicios" → detalle → "Ver estadísticas" abre la misma pantalla.
5. Archivar un ejercicio con historial: sus estadísticas siguen apareciendo.

- [ ] **Step 4: Commit (si hubo ajustes)**

```bash
git add -A
git commit -m "chore: phase 4 verification"
```
