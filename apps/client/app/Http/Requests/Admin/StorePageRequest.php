<?php

namespace App\Http\Requests\Admin;

use App\Enums\PageStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StorePageRequest extends FormRequest
{
    /**
     * Determine if the administrator is authorized to create pages.
     */
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('access-admin');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, list<mixed>>
     */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'slug' => ['required', 'string', 'max:255', 'alpha_dash:ascii', 'unique:pages,slug'],
            'body' => ['required', 'string'],
            'status' => ['required', 'string', Rule::in(PageStatus::values())],
            'published_at' => ['nullable', 'date'],
        ];
    }
}
