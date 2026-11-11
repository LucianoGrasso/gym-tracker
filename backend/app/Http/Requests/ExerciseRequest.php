<?php

namespace App\Http\Requests;

use App\Enums\Equipment;
use App\Enums\MuscleGroup;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => [
                'required', 'string', 'max:100',
                Rule::unique('exercises', 'name')
                    ->where('user_id', $this->user()->id)
                    ->ignore($this->route('exercise')),
            ],
            'muscle_group' => ['required', Rule::enum(MuscleGroup::class)],
            'secondary_muscles' => ['nullable', 'array', 'max:4'],
            'secondary_muscles.*' => ['distinct', Rule::enum(MuscleGroup::class), 'different:muscle_group'],
            'equipment' => ['required', Rule::enum(Equipment::class)],
            'is_unilateral' => ['required', 'boolean'],
            'uses_bodyweight' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'name.unique' => 'Ya tienes un ejercicio con ese nombre.',
            'secondary_muscles.max' => 'Elige hasta 4 músculos secundarios.',
            'secondary_muscles.*.different' => 'El músculo principal no puede ser también secundario.',
        ];
    }
}
