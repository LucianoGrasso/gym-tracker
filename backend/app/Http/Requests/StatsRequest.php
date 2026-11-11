<?php

namespace App\Http\Requests;

use App\Enums\StatsPeriod;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StatsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'period' => ['nullable', Rule::enum(StatsPeriod::class)],
        ];
    }

    public function period(): StatsPeriod
    {
        return StatsPeriod::from($this->validated('period') ?? StatsPeriod::OneMonth->value);
    }

    /** Today in Santiago (the stats calendar). */
    public function today(): CarbonImmutable
    {
        return CarbonImmutable::now('America/Santiago')->startOfDay();
    }

    /** First local date of the period, or null for all time. */
    public function from(): ?string
    {
        return $this->period()->startDate($this->today())?->toDateString();
    }
}
