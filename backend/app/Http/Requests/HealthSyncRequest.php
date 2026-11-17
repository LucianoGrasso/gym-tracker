<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** Resumen que envía el Atajo; acepta decimales (con coma o punto) y los redondea. */
class HealthSyncRequest extends FormRequest
{
    public const FIELDS = ['avg_heart_rate', 'max_heart_rate', 'active_calories'];

    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];
        foreach (self::FIELDS as $field) {
            $value = $this->input($field);
            if (is_string($value)) {
                $value = trim(str_replace(',', '.', $value));
            }
            if ($value === '' || $value === null) {
                $normalized[$field] = null;
            } elseif (is_numeric($value)) {
                $normalized[$field] = (int) round((float) $value);
            } else {
                $normalized[$field] = $value;
            }
        }
        $this->merge($normalized);
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'avg_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'max_heart_rate' => ['nullable', 'integer', 'between:30,250'],
            'active_calories' => ['nullable', 'integer', 'between:0,5000'],
        ];
    }
}
