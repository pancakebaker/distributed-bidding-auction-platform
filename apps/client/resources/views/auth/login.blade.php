<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Login - Distributed Bidding Auction Platform</title>
        @vite(['resources/css/app.css'])
    </head>
    <body>
        <main class="auth-shell">
            <section class="auth-card" aria-labelledby="login-title">
                <p class="eyebrow">Laravel administration</p>
                <h1 id="login-title">Sign in</h1>
                <form method="post" action="{{ route('login.store') }}" class="auth-form">
                    @csrf
                    <label>
                        <span>Email</span>
                        <input name="email" type="email" autocomplete="email" value="{{ old('email') }}" required autofocus>
                    </label>
                    @error('email')
                        <p class="auth-error">{{ $message }}</p>
                    @enderror
                    <label>
                        <span>Password</span>
                        <input name="password" type="password" autocomplete="current-password" required>
                    </label>
                    @error('password')
                        <p class="auth-error">{{ $message }}</p>
                    @enderror
                    <button class="primary-button" type="submit">Sign in</button>
                </form>
            </section>
        </main>
    </body>
</html>
