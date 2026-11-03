<?php

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
