<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class BodyMetricRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** The date comes in the URL; validate it with the body. */
    protected function prepareForValidation(): void
    {
        $this->merge(['date' => $this->route('date')]);
    }

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
            'bodyweight_kg' => ['required', 'numeric', 'between:20,400'],
        ];
    }
}
