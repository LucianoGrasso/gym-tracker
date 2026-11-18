<?php

namespace App\Http\Requests;

use App\Services\Health\HealthSample;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Validator;
use Throwable;

/**
 * Muestras crudas que envía el Atajo: valores y fechas (ISO 8601) como listas paralelas.
 * Cada lista llega como arreglo JSON o como texto con una línea por elemento ("Combinar texto").
 * Los valores aceptan coma decimal; una fecha sin zona horaria se lee en hora de Chile.
 */
class HealthSamplesRequest extends FormRequest
{
    private const MAX_SAMPLES = 50000;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'heart_rate_values' => ['nullable'],
            'heart_rate_dates' => ['nullable'],
            'energy_values' => ['nullable'],
            'energy_dates' => ['nullable'],
            'heart_rate_end_dates' => ['nullable'],
            'energy_end_dates' => ['nullable'],
        ];
    }

    /**
     * @return array<int, callable(Validator): void>
     */
    public function after(): array
    {
        return [function (Validator $validator) {
            foreach (['heart_rate', 'energy'] as $kind) {
                $values = $this->lines("{$kind}_values");
                $dates = $this->lines("{$kind}_dates");
                if (count($values) !== count($dates)) {
                    $validator->errors()->add("{$kind}_dates", 'Debe haber una fecha por cada valor.');
                }
                $ends = $this->lines("{$kind}_end_dates");
                if ($ends !== [] && count($ends) !== count($values)) {
                    $validator->errors()->add("{$kind}_end_dates", 'Debe haber una fecha de fin por cada valor.');
                }
                if (count($values) > self::MAX_SAMPLES) {
                    $validator->errors()->add("{$kind}_values", 'Demasiadas muestras.');
                }
            }
        }];
    }

    /** @return list<HealthSample> */
    public function heartRate(): array
    {
        return $this->samples('heart_rate');
    }

    /** @return list<HealthSample> */
    public function energy(): array
    {
        return $this->samples('energy');
    }

    /** @return list<HealthSample> */
    private function samples(string $kind): array
    {
        $values = $this->lines("{$kind}_values");
        $dates = $this->lines("{$kind}_dates");
        $ends = $this->lines("{$kind}_end_dates");
        $samples = [];
        foreach ($values as $index => $raw) {
            $value = str_replace(',', '.', $raw);
            if (! is_numeric($value) || ! isset($dates[$index])) {
                continue;
            }
            $at = $this->parseDate($dates[$index]);
            if ($at === null) {
                continue;
            }
            $end = isset($ends[$index]) ? $this->parseDate($ends[$index]) : null;
            $samples[] = new HealthSample($at, (float) $value, $end);
        }

        return $samples;
    }

    private function parseDate(string $value): ?Carbon
    {
        try {
            return Carbon::parse($value, config('app.user_timezone'))->utc();
        } catch (Throwable) {
            return null;
        }
    }

    /** @return list<string> */
    private function lines(string $key): array
    {
        $input = $this->input($key);
        $items = is_array($input) ? $input : preg_split('/\R/', (string) $input);

        return array_values(array_filter(
            array_map(fn ($item) => trim((string) $item), $items),
            fn (string $item) => $item !== '',
        ));
    }
}
