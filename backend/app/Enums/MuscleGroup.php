<?php

namespace App\Enums;

enum MuscleGroup: string
{
    case Chest = 'chest';
    case Back = 'back';
    case Shoulders = 'shoulders';
    case Biceps = 'biceps';
    case Triceps = 'triceps';
    case Legs = 'legs';
    case Core = 'core';
    case Other = 'other';
}
