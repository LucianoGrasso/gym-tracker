<?php

namespace App\Http\Requests;

use App\Enums\MuscleGroup;
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
            'muscle_group' => ['nullable', Rule::enum(MuscleGroup::class)],
        ];
    }

    public function period(): StatsPeriod
    {
        return StatsPeriod::from($this->validated('period') ?? StatsPeriod::TwelveWeeks->value);
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

    public function muscleGroup(): ?MuscleGroup
    {
        $value = $this->validated('muscle_group');

        return $value === null ? null : MuscleGroup::from($value);
    }
}
