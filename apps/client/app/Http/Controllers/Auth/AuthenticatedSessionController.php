<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

class AuthenticatedSessionController extends Controller
{
    /**
     * Show the session login form.
     */
    public function create(Request $request): View
    {
        $return = (string) $request->query('return', '');
        if (! $request->session()->has('url.intended') && $this->isSafeLocalPath($return)) {
            $request->session()->put('url.intended', $return);
        }

        return view('auth.login');
    }

    /**
     * Authenticate the user and regenerate the session.
     */
    public function store(Request $request): RedirectResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => 'These credentials do not match our records.',
            ]);
        }

        $request->session()->regenerate();

        return redirect()->intended(
            $request->user()->is_admin ? route('admin.dashboard') : route('auctions.index'),
        );
    }

    /**
     * Log out and invalidate the current session.
     */
    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }

    private function isSafeLocalPath(string $path): bool
    {
        return $path !== ''
            && str_starts_with($path, '/')
            && ! str_starts_with($path, '//')
            && ! str_contains($path, '\\')
            && parse_url($path, PHP_URL_HOST) === null
            && preg_match('/[\x00-\x1F\x7F]/', $path) !== 1;
    }
}
