<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use App\Enums\Side;
use App\Models\Workout;
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
        ];
    }
}
