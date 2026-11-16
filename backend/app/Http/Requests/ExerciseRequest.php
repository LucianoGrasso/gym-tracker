<?php

namespace App\Http\Requests;

use App\Enums\Equipment;
use App\Enums\ExerciseKind;
use App\Enums\MuscleGroup;
use App\Models\Exercise;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class ExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** Un ejercicio de cardio no trabaja músculos en las estadísticas: se guardan valores neutros. */
    protected function prepareForValidation(): void
    {
        if ($this->input('kind') === ExerciseKind::Cardio->value) {
            $this->merge([
                'muscle_group' => 'other',
                'secondary_muscles' => [],
                'is_unilateral' => false,
                'uses_bodyweight' => false,
            ]);
        }
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
            'kind' => ['sometimes', Rule::enum(ExerciseKind::class)],
            'muscle_group' => ['required', Rule::enum(MuscleGroup::class)],
            'secondary_muscles' => ['nullable', 'array', 'max:4'],
            'secondary_muscles.*' => ['distinct', Rule::enum(MuscleGroup::class), 'different:muscle_group'],
            'equipment' => ['required', Rule::enum(Equipment::class)],
            'is_unilateral' => ['required', 'boolean'],
            'uses_bodyweight' => ['required', 'boolean'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator) {
            $exercise = $this->route('exercise');
            if (
                $exercise instanceof Exercise
                && $this->has('kind')
                && $this->input('kind') !== $exercise->kind->value
                && $exercise->workoutExercises()->exists()
            ) {
                $validator->errors()->add('kind', 'El ejercicio tiene historial: no puedes cambiar su tipo.');
            }
        }];
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
