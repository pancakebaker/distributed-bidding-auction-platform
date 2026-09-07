<?php

namespace App\Http\Controllers\Admin;

use App\Events\PageCreated;
use App\Events\PageUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StorePageRequest;
use App\Http\Requests\Admin\UpdatePageRequest;
use App\Models\Page;
use App\Support\AdminBootstrapData;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class AdminPageController extends Controller
{
    /**
     * Render the page management list.
     */
    public function index(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::pages());
    }

    /**
     * Render the page creation form.
     */
    public function create(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::pageCreate($request));
    }

    /**
     * Store a new page with creator/updater derived from the authenticated admin.
     */
    public function store(StorePageRequest $request): RedirectResponse
    {
        $page = new Page($request->validated());
        $page->created_by = $request->user()->id;
        $page->updated_by = $request->user()->id;
        $page->save();

        PageCreated::dispatch($page, $request->user()->id);

        return redirect()
            ->route('admin.pages.edit', $page)
            ->with('status', 'Page saved.');
    }

    /**
     * Render the page editing form.
     */
    public function edit(Request $request, Page $page): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::pageEdit($request, $page));
    }

    /**
     * Update an existing page with updater derived from the authenticated admin.
     */
    public function update(UpdatePageRequest $request, Page $page): RedirectResponse
    {
        $oldSlug = $page->slug;

        $page->fill($request->validated());
        $page->updated_by = $request->user()->id;
        $page->save();

        PageUpdated::dispatch($page, $request->user()->id, $oldSlug);

        return redirect()
            ->route('admin.pages.edit', $page)
            ->with('status', 'Page saved.');
    }
}
