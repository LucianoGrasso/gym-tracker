<?php

namespace App\Enums;

use Carbon\CarbonImmutable;

/** Rolling windows that end today, so "1 sem" on a monday still shows the last seven days. */
enum StatsPeriod: string
{
    case OneWeek = '1w';
    case OneMonth = '1m';
    case ThreeMonths = '3m';
    case SixMonths = '6m';
    case OneYear = '1y';
    case All = 'all';

    /** First local date included in the period, or null for all time. */
    public function startDate(CarbonImmutable $today): ?CarbonImmutable
    {
        return match ($this) {
            self::OneWeek => $today->subDays(6),
            self::OneMonth => $today->subMonthsNoOverflow(1)->addDay(),
            self::ThreeMonths => $today->subMonthsNoOverflow(3)->addDay(),
            self::SixMonths => $today->subMonthsNoOverflow(6)->addDay(),
            self::OneYear => $today->subYearNoOverflow()->addDay(),
            self::All => null,
        };
    }
}
