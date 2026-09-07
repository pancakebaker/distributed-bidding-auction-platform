<?php

namespace App\Http\Controllers\Cms;

use App\Contracts\CmsCache;
use App\Http\Controllers\Controller;
use App\Models\Page;
use Illuminate\Contracts\View\View;

class PublicPageController extends Controller
{
    /**
     * Create the public page controller.
     */
    public function __construct(private readonly CmsCache $cache) {}

    /**
     * Render one publicly visible CMS page.
     */
    public function show(Page $page): View
    {
        abort_unless($page->isPubliclyVisible(), 404);

        $pagePayload = $this->cache->getPage($page->slug);

        abort_unless($pagePayload !== null, 404);

        return view('cms', [
            'cmsBootstrap' => [
                'page' => 'page',
                'props' => $pagePayload,
            ],
        ]);
    }
}
