<?php

namespace App\Http\Requests;

use App\Models\Routine;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class WorkoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'routine_day_id' => [
                'nullable', 'integer',
                Rule::exists('routine_days', 'id')->where(
                    fn ($query) => $query->whereIn('routine_id', Routine::query()->select('id'))
                ),
            ],
            'date' => ['required', 'date_format:Y-m-d'],
            'started_at' => ['required', 'date'],
            'finished_at' => ['nullable', 'date', 'after_or_equal:started_at'],
            'bodyweight_kg' => ['nullable', 'numeric', 'between:20,400'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
