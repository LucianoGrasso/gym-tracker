<?php

namespace App\Http\Requests;

use App\Enums\SetType;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RoutineDayExerciseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'exercise_id' => [
                $this->isMethod('post') ? 'required' : 'prohibited',
                'integer',
                Rule::exists('exercises', 'id')->where('user_id', $this->user()->id),
            ],
            'target_sets' => ['required', 'integer', 'between:1,20'],
            'target_reps_min' => ['nullable', 'integer', 'between:1,100'],
            'target_reps_max' => ['nullable', 'integer', 'between:1,100'],
            'target_text' => ['nullable', 'string', 'max:150'],
            'default_set_type' => ['required', Rule::enum(SetType::class)],
            'rest_seconds' => ['required', 'integer', 'between:0,900'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $min = $this->input('target_reps_min');
                $max = $this->input('target_reps_max');
                if (is_numeric($min) && is_numeric($max) && (int) $max < (int) $min) {
                    $validator->errors()->add('target_reps_max', 'El máximo de reps no puede ser menor que el mínimo.');
                }
            },
        ];
    }

    public function messages(): array
    {
        return ['exercise_id.exists' => 'Elige uno de tus ejercicios.'];
    }
}
