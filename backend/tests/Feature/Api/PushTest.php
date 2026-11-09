<?php

use App\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
    config()->set('services.push.signing_key', 'test-signing-key');
    config()->set('services.push.vapid_public_key', 'BPublicKey');
});

it('requires authentication', function () {
    $this->getJson('/api/push/config')->assertUnauthorized();
    $this->postJson('/api/push/token', ['endpoint' => 'https://push.example.com/send/abc'])->assertUnauthorized();
});

it('returns the VAPID public key', function () {
    $this->actingAs($this->user)->getJson('/api/push/config')
        ->assertOk()
        ->assertExactJson(['data' => ['public_key' => 'BPublicKey']]);
});

it('signs the subscription endpoint', function () {
    $this->actingAs($this->user)
        ->postJson('/api/push/token', ['endpoint' => 'https://push.example.com/send/abc'])
        ->assertOk()
        ->assertExactJson(['data' => ['signature' => 'dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555']]);
});

it('rejects endpoints that are not https URLs', function (mixed $endpoint) {
    $this->actingAs($this->user)
        ->postJson('/api/push/token', ['endpoint' => $endpoint])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('endpoint');
})->with([
    'missing' => [null],
    'http' => ['http://push.example.com/send/abc'],
    'not a url' => ['hola'],
    'too long' => ['https://push.example.com/'.str_repeat('a', 1000)],
]);
