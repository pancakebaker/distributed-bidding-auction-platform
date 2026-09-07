<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

class StoreFaqRequest extends FormRequest
{
    /**
     * Determine if the administrator is authorized to create FAQs.
     */
    public function authorize(): bool
    {
        return (bool) $this->user()?->can('access-admin');
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, list<string>>
     */
    public function rules(): array
    {
        return [
            'question' => ['required', 'string', 'max:255'],
            'answer' => ['required', 'string'],
            'sort_order' => ['required', 'integer', 'min:0'],
            'is_published' => ['required', 'boolean'],
        ];
    }
}
