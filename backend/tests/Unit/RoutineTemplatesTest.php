<?php

use App\Enums\SetType;
use App\Support\ExerciseCatalog;
use App\Support\RoutineTemplates;

it('offers the seven agreed templates with unique slugs', function () {
    expect(array_column(RoutineTemplates::all(), 'slug'))->toBe([
        'nippard-ppl', 'arnold-golden-six', 'arnold-blueprint', 'reg-park-5x5', 'phul', 'ronnie-coleman', 'cbum',
    ]);
});

it('marks athlete-inspired templates', function () {
    expect(RoutineTemplates::find('nippard-ppl')['inspired_by'])->toBe('Jeff Nippard')
        ->and(RoutineTemplates::find('cbum')['inspired_by'])->toBe('Chris Bumstead')
        ->and(RoutineTemplates::find('phul')['inspired_by'])->toBeNull()
        ->and(RoutineTemplates::find('nope'))->toBeNull();
});

it('keeps every template consistent and within API limits', function () {
    foreach (RoutineTemplates::all() as $template) {
        expect($template['days_per_week'])->toBe(count($template['days']));
        foreach ($template['days'] as $day) {
            expect($day['weekday'] === null || ($day['weekday'] >= 1 && $day['weekday'] <= 7))->toBeTrue()
                ->and($day['exercises'])->not->toBeEmpty();
            foreach ($day['exercises'] as $e) {
                $label = "{$template['slug']} / {$day['name']} / {$e['name']}";
                expect(ExerciseCatalog::has($e['name']))->toBeTrue($label)
                    ->and($e['target_sets'])->toBeGreaterThanOrEqual(1)->toBeLessThanOrEqual(20)
                    ->and($e['rest_seconds'])->toBeGreaterThanOrEqual(0)->toBeLessThanOrEqual(900)
                    ->and($e['default_set_type'])->toBeInstanceOf(SetType::class)
                    ->and(($e['target_reps_min'] === null) === ($e['target_reps_max'] === null))->toBeTrue($label);
                if ($e['target_reps_min'] !== null) {
                    expect($e['target_reps_min'])->toBeGreaterThanOrEqual(1)
                        ->and($e['target_reps_max'])->toBeLessThanOrEqual(100)
                        ->and($e['target_reps_min'])->toBeLessThanOrEqual($e['target_reps_max']);
                } else {
                    expect($e['target_text'])->not->toBeNull($label);
                }
                expect(mb_strlen((string) $e['target_text']))->toBeLessThanOrEqual(150);
            }
        }
    }
});

it('follows the published Golden Six', function () {
    $template = RoutineTemplates::find('arnold-golden-six');

    expect(array_column($template['days'][0]['exercises'], 'name'))->toBe([
        'Sentadilla', 'Press de banca', 'Dominadas', 'Press tras nuca', 'Curl con barra', 'Crunch abdominal',
    ])->and(array_column($template['days'], 'weekday'))->toBe([1, 3, 5]);
});
