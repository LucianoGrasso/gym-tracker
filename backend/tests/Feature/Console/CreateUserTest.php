<?php

use App\Models\Exercise;
use App\Models\Routine;
use App\Models\User;
use Illuminate\Support\Facades\Hash;

it('creates a user with a hashed password', function () {
    $this->artisan('app:create-user', [
        'email' => 'nuevo@gymtracker.test',
        'name' => 'Nuevo',
        '--password' => 'secret123',
    ])->assertSuccessful();

    $user = User::where('email', 'nuevo@gymtracker.test')->sole();

    expect($user->name)->toBe('Nuevo')
        ->and(Hash::check('secret123', $user->password))->toBeTrue();
});

it('fails on duplicated email or short password', function () {
    User::factory()->create(['email' => 'dup@gymtracker.test']);

    $this->artisan('app:create-user', [
        'email' => 'dup@gymtracker.test',
        'name' => 'Dup',
        '--password' => 'short',
    ])->assertFailed();

    expect(User::count())->toBe(1);
});

it('loads the starter exercises and routine with --seed', function () {
    $this->artisan('app:create-user', [
        'email' => 'seed@gymtracker.test',
        'name' => 'Seed',
        '--password' => 'secret123',
        '--seed' => true,
    ])->assertSuccessful();

    $user = User::where('email', 'seed@gymtracker.test')->sole();

    expect(Exercise::withoutGlobalScopes()->where('user_id', $user->id)->count())->toBeGreaterThan(10)
        ->and(Routine::withoutGlobalScopes()->where('user_id', $user->id)->where('is_active', true)->count())->toBe(1);
});

it('creates an empty account without --seed', function () {
    $this->artisan('app:create-user', [
        'email' => 'empty@gymtracker.test',
        'name' => 'Empty',
        '--password' => 'secret123',
    ])->assertSuccessful();

    $user = User::where('email', 'empty@gymtracker.test')->sole();

    expect(Exercise::withoutGlobalScopes()->where('user_id', $user->id)->count())->toBe(0);
});
