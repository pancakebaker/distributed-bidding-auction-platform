<?php

namespace App\Contracts;

interface CmsCache
{
    /**
     * Get the publicly visible CMS pages used by the public navigation.
     *
     * @return array<int, array{title: string, slug: string}>
     */
    public function getPublicNavigationPages(): array;

    /**
     * Remove the cached public navigation page list.
     */
    public function forgetPublicNavigationPages(): void;

    /**
     * Get a publicly visible CMS page by slug.
     *
     * @return array{title: string, body: string, published_at: string|null}|null
     */
    public function getPage(string $slug): ?array;

    /**
     * Remove the cached public page payload for a slug.
     */
    public function forgetPage(string $slug): void;

    /**
     * Get the public FAQ payload.
     *
     * @return array<int, array{id: int, question: string, answer: string}>
     */
    public function getFaqs(): array;

    /**
     * Remove the cached public FAQ payload.
     */
    public function forgetFaqs(): void;
}
