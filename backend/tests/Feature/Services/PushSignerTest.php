<?php

use App\Services\Push\PushSigner;

it('signs an endpoint with HMAC-SHA256 (same vector as the push Lambda)', function () {
    config()->set('services.push.signing_key', 'test-signing-key');

    expect(app(PushSigner::class)->sign('https://push.example.com/send/abc'))
        ->toBe('dfad34ed1137f5f974053060f49ea947a78018b6f8dbb6ec21c1899314ba4555');
});

it('refuses to sign without a key', function () {
    config()->set('services.push.signing_key', null);

    app(PushSigner::class)->sign('https://push.example.com/send/abc');
})->throws(RuntimeException::class);
