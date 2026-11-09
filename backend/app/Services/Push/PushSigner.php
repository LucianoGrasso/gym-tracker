<?php

namespace App\Services\Push;

use RuntimeException;

/** Firma la suscripción push de un dispositivo; la Lambda de push verifica la firma con la misma clave. */
class PushSigner
{
    public function sign(string $endpoint): string
    {
        $key = config('services.push.signing_key');

        if (! is_string($key) || $key === '') {
            throw new RuntimeException('PUSH_SIGNING_KEY no está configurada.');
        }

        return hash_hmac('sha256', $endpoint, $key);
    }
}
