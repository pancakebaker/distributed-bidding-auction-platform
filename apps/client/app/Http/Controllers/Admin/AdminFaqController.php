<?php

namespace App\Http\Controllers\Admin;

use App\Events\FaqCreated;
use App\Events\FaqUpdated;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreFaqRequest;
use App\Http\Requests\Admin\UpdateFaqRequest;
use App\Models\Faq;
use App\Support\AdminBootstrapData;
use App\Support\AdminResponse;
use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class AdminFaqController extends Controller
{
    /**
     * Render the FAQ management list.
     */
    public function index(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::faqs());
    }

    /**
     * Render the FAQ creation form.
     */
    public function create(Request $request): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::faqCreate($request));
    }

    /**
     * Store a new FAQ with creator/updater derived from the authenticated admin.
     */
    public function store(StoreFaqRequest $request): RedirectResponse
    {
        $faq = new Faq($request->validated());
        $faq->created_by = $request->user()->id;
        $faq->updated_by = $request->user()->id;
        $faq->save();

        FaqCreated::dispatch($faq, $request->user()->id);

        return redirect()
            ->route('admin.faqs.edit', $faq)
            ->with('status', 'FAQ saved.');
    }

    /**
     * Render the FAQ editing form.
     */
    public function edit(Request $request, Faq $faq): View|JsonResponse
    {
        return AdminResponse::make($request, AdminBootstrapData::faqEdit($request, $faq));
    }

    /**
     * Update an existing FAQ with updater derived from the authenticated admin.
     */
    public function update(UpdateFaqRequest $request, Faq $faq): RedirectResponse
    {
        $faq->fill($request->validated());
        $faq->updated_by = $request->user()->id;
        $faq->save();

        FaqUpdated::dispatch($faq, $request->user()->id);

        return redirect()
            ->route('admin.faqs.edit', $faq)
            ->with('status', 'FAQ saved.');
    }
}
