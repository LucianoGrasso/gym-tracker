<?php

namespace App\Http\Requests;

use App\Enums\MuscleGroup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ListExercisesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'search' => ['nullable', 'string', 'max:100'],
            'muscle_group' => ['nullable', Rule::enum(MuscleGroup::class)],
            'archived' => ['nullable', 'boolean'],
        ];
    }
}
