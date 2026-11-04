<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $userId = $this->user()->id;

        return [
            'workout_id' => ['required', 'string', Rule::exists('workouts', 'id')->where('user_id', $userId)],
            'exercise_id' => ['required', 'integer', Rule::exists('exercises', 'id')->where('user_id', $userId)],
            'position' => ['required', 'integer', 'between:0,100'],
            'target_sets' => ['nullable', 'integer', 'between:1,20'],
            'target_reps_min' => ['nullable', 'integer', 'between:1,100'],
            'target_reps_max' => ['nullable', 'integer', 'between:1,100'],
            'target_text' => ['nullable', 'string', 'max:150'],
            'default_set_type' => ['required', Rule::enum(SetType::class)],
            'rest_seconds' => ['required', 'integer', 'between:0,900'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
