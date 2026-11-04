<?php

namespace App\Enums;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

enum StatsPeriod: string
{
    case FourWeeks = '4w';
    case TwelveWeeks = '12w';
    case SixMonths = '6m';
    case OneYear = '1y';
    case All = 'all';

    /** First local date included in the period (a monday), or null for all time. */
    public function startDate(CarbonImmutable $today): ?CarbonImmutable
    {
        $week = $today->startOfWeek(CarbonInterface::MONDAY);

        return match ($this) {
            self::FourWeeks => $week->subWeeks(3),
            self::TwelveWeeks => $week->subWeeks(11),
            self::SixMonths => $today->subMonthsNoOverflow(6)->startOfWeek(CarbonInterface::MONDAY),
            self::OneYear => $today->subYearNoOverflow()->startOfWeek(CarbonInterface::MONDAY),
            self::All => null,
        };
    }
}
