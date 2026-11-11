<?php

namespace App\Http\Requests;

use App\Support\ExerciseCatalog;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class FromLibraryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'slug' => ['required', 'string', Rule::in(array_column(ExerciseCatalog::all(), 'slug'))],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['slug.in' => 'Ese ejercicio no está en la biblioteca.'];
    }

    /** @return array{slug: string, name: string} */
    public function libraryExercise(): array
    {
        return ExerciseCatalog::findBySlug($this->validated('slug'));
    }
}
