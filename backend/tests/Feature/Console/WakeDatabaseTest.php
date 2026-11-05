<?php

it('wakes the database with a minimal query', function () {
    $this->artisan('app:wake-db')
        ->expectsOutput('Base de datos despierta.')
        ->assertSuccessful();
});

it('fails after retrying when the database does not answer', function () {
    config(['database.connections.unreachable' => [
        'driver' => 'sqlite',
        'database' => '/nonexistent/gymtracker.sqlite',
        'prefix' => '',
    ]]);

    $this->artisan('app:wake-db', ['--attempts' => 2, '--sleep' => 0, '--database' => 'unreachable'])
        ->assertFailed();
});
