<?php

use App\Http\Controllers\Admin\AdminAuctionController;
use App\Http\Controllers\Admin\AdminAuditLogController;
use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminExportController;
use App\Http\Controllers\Admin\AdminFaqController;
use App\Http\Controllers\Admin\AdminPageController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuctionOperationsController;
use App\Http\Controllers\Admin\LiveFeedAdminController;
use App\Http\Controllers\AuctionCommandController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Cms\PublicFaqController;
use App\Http\Controllers\Cms\PublicPageController;
use App\Http\Controllers\NotificationPreferenceController;
use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome');
Route::view('/auctions', 'welcome')->name('auctions.index');
Route::view('/auctions/{auction}', 'welcome');

Route::get('/faq', [PublicFaqController::class, 'index'])->name('cms.faq.index');
Route::get('/pages/{page:slug}', [PublicPageController::class, 'show'])->name('cms.pages.show');

Route::get('/login', [AuthenticatedSessionController::class, 'create'])->name('login');
Route::post('/login', [AuthenticatedSessionController::class, 'store'])->name('login.store');
Route::post('/logout', [AuthenticatedSessionController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

Route::middleware('auth')->group(function (): void {
    Route::post('/api/auctions/{auction}/bids', [AuctionCommandController::class, 'placeBid'])
        ->name('api.auctions.bids.store');
    Route::post('/api/auctions/{auction}/buy-now', [AuctionCommandController::class, 'buyNow'])
        ->name('api.auctions.buy-now');

    Route::get('/account/notifications', [NotificationPreferenceController::class, 'edit'])
        ->name('account.notifications.edit');
    Route::put('/account/notifications', [NotificationPreferenceController::class, 'update'])
        ->name('account.notifications.update');
});

Route::middleware(['auth', 'can:access-admin'])
    ->prefix('admin')
    ->name('admin.')
    ->group(function (): void {
        Route::get('/', AdminDashboardController::class)->name('dashboard');
        Route::get('/live-feed', LiveFeedAdminController::class)->name('live-feed');
        Route::get('/auction-operations', AuctionOperationsController::class)
            ->name('auction-operations');
        Route::post('/live-feed/token', [LiveFeedAdminController::class, 'token'])
            ->name('live-feed.token');
        Route::get('/users', [AdminUserController::class, 'index'])->name('users.index');
        Route::get('/audit-logs', [AdminAuditLogController::class, 'index'])
            ->name('audit-logs.index');
        Route::post('/audit-logs/export', [AdminExportController::class, 'store'])
            ->name('audit-logs.export');
        Route::get('/exports', [AdminExportController::class, 'index'])->name('exports.index');
        Route::get('/exports/{export}/download', [AdminExportController::class, 'download'])
            ->name('exports.download');
        Route::get('/auctions', AdminAuctionController::class)->name('auctions');
        Route::post('/api/auctions', [AdminAuctionController::class, 'create'])
            ->name('api.auctions.create');
        Route::put('/api/auctions/{auction}', [AdminAuctionController::class, 'update'])
            ->name('api.auctions.update');
        Route::delete('/api/auctions/{auction}', [AdminAuctionController::class, 'delete'])
            ->name('api.auctions.delete');
        Route::post('/api/auctions/{auction}/cancel', [AdminAuctionController::class, 'cancel'])
            ->name('api.auctions.cancel');

        Route::get('/pages', [AdminPageController::class, 'index'])->name('pages.index');
        Route::get('/pages/create', [AdminPageController::class, 'create'])->name('pages.create');
        Route::post('/pages', [AdminPageController::class, 'store'])->name('pages.store');
        Route::get('/pages/{page}/edit', [AdminPageController::class, 'edit'])->name('pages.edit');
        Route::put('/pages/{page}', [AdminPageController::class, 'update'])->name('pages.update');

        Route::get('/faqs', [AdminFaqController::class, 'index'])->name('faqs.index');
        Route::get('/faqs/create', [AdminFaqController::class, 'create'])->name('faqs.create');
        Route::post('/faqs', [AdminFaqController::class, 'store'])->name('faqs.store');
        Route::get('/faqs/{faq}/edit', [AdminFaqController::class, 'edit'])->name('faqs.edit');
        Route::put('/faqs/{faq}', [AdminFaqController::class, 'update'])->name('faqs.update');
    });
