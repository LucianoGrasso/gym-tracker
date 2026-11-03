<?php

namespace App\Enums;

enum SetType: string
{
    case Warmup = 'warmup';
    case Normal = 'normal';
    case Bilbo = 'bilbo';
    case Heavy = 'heavy';
    case Failure = 'failure';
    case Dropset = 'dropset';
}
