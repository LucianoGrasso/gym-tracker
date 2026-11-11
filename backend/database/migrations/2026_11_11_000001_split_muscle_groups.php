<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Espalda" y "Piernas" se dividen en músculos más finos. El mapeo por nombre es una copia del
 * catálogo de hoy, para que esta migración no cambie si el catálogo cambia después.
 */
return new class extends Migration
{
    /** @var array<string, string> exercise name => new muscle group */
    private const BY_NAME = [
        'Dominadas' => 'lats',
        'Jalón al pecho' => 'lats',
        'Remo con mancuerna' => 'lats',
        'Remo con barra' => 'upper_back',
        'Remo en T' => 'upper_back',
        'Remo sentado en polea' => 'upper_back',
        'Encogimientos con mancuernas' => 'upper_back',
        'Peso muerto' => 'hamstrings',
        'Hiperextensiones' => 'hamstrings',
        'Peso muerto rumano' => 'hamstrings',
        'Curl femoral' => 'hamstrings',
        'Sentadilla' => 'quads',
        'Sentadilla frontal' => 'quads',
        'Sentadilla hack' => 'quads',
        'Sentadilla búlgara' => 'quads',
        'Prensa de piernas' => 'quads',
        'Zancadas con mancuernas' => 'quads',
        'Extensión de cuádriceps' => 'quads',
        'Hip thrust' => 'glutes',
        'Gemelos en máquina' => 'calves',
    ];

    public function up(): void
    {
        foreach (self::BY_NAME as $name => $group) {
            DB::table('exercises')->where('name', $name)->whereIn('muscle_group', ['back', 'legs'])->update(['muscle_group' => $group]);
        }
        DB::table('exercises')->where('muscle_group', 'back')->update(['muscle_group' => 'lats']);
        DB::table('exercises')->where('muscle_group', 'legs')->update(['muscle_group' => 'quads']);
    }

    public function down(): void
    {
        DB::table('exercises')->whereIn('muscle_group', ['lats', 'upper_back'])->update(['muscle_group' => 'back']);
        DB::table('exercises')->whereIn('muscle_group', ['quads', 'hamstrings', 'glutes', 'calves'])->update(['muscle_group' => 'legs']);
    }
};
