<?php

namespace App\Http\Requests;

use App\Enums\ExerciseKind;
use App\Enums\SetType;
use App\Enums\Side;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutSetRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'workout_exercise_id' => [
                'required', 'string',
                Rule::exists('workout_exercises', 'id')->where(
                    fn ($query) => $query->whereIn('workout_id', Workout::query()->select('id'))
                ),
            ],
            'set_number' => ['required', 'integer', 'between:1,100'],
            'set_type' => ['required', Rule::enum(SetType::class)],
            'weight_kg' => ['required', 'numeric', 'between:0,999.99'],
            'reps' => ['required', 'integer', 'between:0,999'],
            'side' => ['required', Rule::enum(Side::class)],
            'rir' => ['nullable', 'integer', 'between:0,10'],
            'pain_level' => ['nullable', 'integer', 'between:0,10'],
            'notes' => ['nullable', 'string', 'max:1000'],
            'duration_seconds' => [Rule::requiredIf(fn () => $this->isCardio()), 'nullable', 'integer', 'between:1,86400'],
            'speed_kmh' => ['nullable', 'numeric', 'between:0,60'],
            'incline_pct' => ['nullable', 'numeric', 'between:0,40'],
            'distance_km' => ['nullable', 'numeric', 'between:0,999.99'],
            'avg_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'calories' => ['nullable', 'integer', 'between:0,9999'],
        ];
    }

    public function messages(): array
    {
        return ['duration_seconds.required' => 'La duración es obligatoria.'];
    }

    private function isCardio(): bool
    {
        return WorkoutExercise::query()
            ->whereKey($this->input('workout_exercise_id'))
            ->whereHas('exercise', fn ($query) => $query->where('kind', ExerciseKind::Cardio->value))
            ->exists();
    }
}
