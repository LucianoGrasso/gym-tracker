<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PushTokenRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'endpoint' => ['required', 'string', 'url', 'starts_with:https://', 'max:1000'],
        ];
    }
}
