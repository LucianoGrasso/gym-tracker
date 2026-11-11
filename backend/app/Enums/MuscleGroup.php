<?php

namespace App\Enums;

enum MuscleGroup: string
{
    case Chest = 'chest';
    case Lats = 'lats';
    case UpperBack = 'upper_back';
    case Shoulders = 'shoulders';
    case Biceps = 'biceps';
    case Triceps = 'triceps';
    case Quads = 'quads';
    case Hamstrings = 'hamstrings';
    case Glutes = 'glutes';
    case Calves = 'calves';
    case Core = 'core';
    case Other = 'other';
}
