<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class RoutineDayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $day = $this->route('routineDay');
        $routineId = $day?->routine_id ?? $this->route('routine')->id;

        return [
            'name' => ['required', 'string', 'max:100'],
            'weekday' => [
                'nullable', 'integer', 'between:1,7',
                Rule::unique('routine_days', 'weekday')->where('routine_id', $routineId)->ignore($day),
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required' => 'El nombre es obligatorio.',
            'weekday.unique' => 'Ya hay un día de esta rutina asignado a ese día de la semana.',
        ];
    }
}
