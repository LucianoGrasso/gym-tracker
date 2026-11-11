<?php

use App\Models\User;
use Illuminate\Support\Facades\DB;

it('copies the secondary muscles of known exercises by name', function () {
    $user = User::factory()->create();
    foreach (['Press de banca' => 'chest', 'Mi press raro' => 'chest'] as $name => $group) {
        DB::table('exercises')->insert([
            'user_id' => $user->id, 'name' => $name, 'muscle_group' => $group, 'equipment' => 'barbell',
            'is_unilateral' => false, 'uses_bodyweight' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    (require database_path('migrations/2026_11_11_000002_add_secondary_muscles_to_exercises.php'))->backfill();

    expect(DB::table('exercises')->pluck('secondary_muscles', 'name')->map(fn ($json) => json_decode((string) $json, true))->all())
        ->toBe(['Press de banca' => ['triceps', 'shoulders'], 'Mi press raro' => null]);
});
