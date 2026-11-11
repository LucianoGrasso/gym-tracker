<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Músculos secundarios (cuentan ½ serie en las estadísticas). Los ejercicios que ya existen los
 * reciben por nombre; el mapeo es una copia de la biblioteca de hoy para no depender de cambios futuros.
 */
return new class extends Migration
{
    /** @var array<string, list<string>> exercise name => secondary muscles */
    private const BY_NAME = [
        'Press de banca' => ['triceps', 'shoulders'],
        'Press con mancuernas' => ['triceps', 'shoulders'],
        'Press inclinado con barra' => ['shoulders', 'triceps'],
        'Press inclinado con mancuernas' => ['shoulders', 'triceps'],
        'Press de pecho en máquina' => ['triceps', 'shoulders'],
        'Aperturas con mancuernas' => ['shoulders'],
        'Cruce de poleas' => ['shoulders'],
        'Pullover con mancuerna' => ['lats', 'triceps'],
        'Dominadas' => ['biceps', 'upper_back'],
        'Jalón al pecho' => ['biceps', 'upper_back'],
        'Remo con mancuerna' => ['upper_back', 'biceps'],
        'Remo con barra' => ['lats', 'biceps'],
        'Remo en T' => ['lats', 'biceps'],
        'Remo sentado en polea' => ['lats', 'biceps'],
        'Peso muerto' => ['glutes', 'upper_back'],
        'Hiperextensiones' => ['glutes'],
        'Press militar con barra' => ['triceps'],
        'Press de hombro con mancuernas' => ['triceps'],
        'Press tras nuca' => ['triceps', 'upper_back'],
        'Elevaciones laterales' => ['upper_back'],
        'Elevaciones laterales en polea' => ['upper_back'],
        'Pájaros con mancuernas' => ['upper_back'],
        'Face pull' => ['upper_back'],
        'Curl martillo' => ['other'],
        'Fondos' => ['chest', 'shoulders'],
        'Press de banca agarre cerrado' => ['chest', 'shoulders'],
        'Sentadilla' => ['glutes', 'hamstrings'],
        'Sentadilla frontal' => ['glutes', 'core'],
        'Sentadilla hack' => ['glutes'],
        'Sentadilla búlgara' => ['glutes'],
        'Prensa de piernas' => ['glutes'],
        'Zancadas con mancuernas' => ['glutes', 'hamstrings'],
        'Peso muerto rumano' => ['glutes'],
        'Hip thrust' => ['hamstrings'],
    ];

    public function up(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->json('secondary_muscles')->nullable()->after('muscle_group');
        });
        $this->backfill();
    }

    public function down(): void
    {
        Schema::table('exercises', function (Blueprint $table) {
            $table->dropColumn('secondary_muscles');
        });
    }

    /** Solo si el músculo principal no lo contiene (un usuario pudo haberlo cambiado). */
    public function backfill(): void
    {
        foreach (self::BY_NAME as $name => $secondary) {
            DB::table('exercises')
                ->where('name', $name)
                ->whereNotIn('muscle_group', $secondary)
                ->update(['secondary_muscles' => json_encode($secondary)]);
        }
    }
};
