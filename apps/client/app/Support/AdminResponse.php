<?php

namespace App\Support;

use Illuminate\Contracts\View\View;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AdminResponse
{
    /**
     * Return JSON bootstrap data for internal admin navigation or Blade for direct page loads.
     *
     * @param  array<string, mixed>  $bootstrap
     */
    public static function make(Request $request, array $bootstrap): View|JsonResponse
    {
        if ($request->expectsJson()) {
            return response()->json($bootstrap);
        }

        return view('admin', ['adminBootstrap' => $bootstrap]);
    }
}
