<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Resumen que envía el Atajo; acepta decimales (con coma o punto) y los redondea.
 * Un 0 significa "sin muestras" (Calcular estadísticas de Atajos devuelve 0 con la lista vacía).
 */
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
                $rounded = (int) round((float) $value);
                $normalized[$field] = $rounded === 0 ? null : $rounded;
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
            'active_calories' => ['nullable', 'integer', 'between:1,5000'],
        ];
    }
}
