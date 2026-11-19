<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class RoutineScheduleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'days' => ['present', 'array'],
            'days.*.id' => [
                'required', 'integer', 'distinct',
                Rule::exists('routine_days', 'id')->where('routine_id', $this->route('routine')->id),
            ],
            'days.*.weekday' => ['present', 'nullable', 'integer', 'between:1,7'],
        ];
    }

    /** Reglas sobre el conjunto: weekdays sin repetir y todos los días de la rutina presentes. */
    public function after(): array
    {
        return [function (Validator $validator) {
            $days = collect($this->input('days', []));
            $weekdays = $days->pluck('weekday')->reject(fn ($weekday) => $weekday === null);

            if ($weekdays->count() !== $weekdays->unique()->count()) {
                $validator->errors()->add('days', 'Hay dos días asignados al mismo día de la semana.');
            }

            if ($days->count() !== $this->route('routine')->days()->count()) {
                $validator->errors()->add('days', 'Faltan días de la rutina.');
            }
        }];
    }
}
