<?php

it('reports the api and database as healthy', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertExactJson(['status' => 'ok']);
});

it('does not require authentication', function () {
    $this->getJson('/api/health')->assertOk();
});
