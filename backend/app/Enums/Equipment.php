<?php

namespace App\Enums;

enum Equipment: string
{
    case Barbell = 'barbell';
    case Dumbbell = 'dumbbell';
    case Bodyweight = 'bodyweight';
    case Machine = 'machine';
    case Cable = 'cable';
}
