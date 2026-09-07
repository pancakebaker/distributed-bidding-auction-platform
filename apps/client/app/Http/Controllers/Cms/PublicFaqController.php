<?php

namespace App\Http\Controllers\Cms;

use App\Contracts\CmsCache;
use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;

class PublicFaqController extends Controller
{
    /**
     * Create the public FAQ controller.
     */
    public function __construct(private readonly CmsCache $cache) {}

    /**
     * Render the public FAQ page with published questions only.
     */
    public function index(): View
    {
        return view('cms', [
            'cmsBootstrap' => [
                'page' => 'faq',
                'props' => [
                    'faqs' => $this->cache->getFaqs(),
                ],
            ],
        ]);
    }
}
