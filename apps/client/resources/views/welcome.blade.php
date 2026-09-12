<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Distributed Bidding Auction Platform</title>
        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/app.tsx'])
    </head>
    <body>
        @include('partials.public-navigation')
        <div id="app"></div>
        <script>
            window.__AUTH_BOOTSTRAP__ = {{ Illuminate\Support\Js::from([
                'authenticated' => auth()->check(),
                'displayName' => auth()->user()?->name,
                'isAdmin' => (bool) auth()->user()?->is_admin,
            ]) }};
        </script>
    </body>
</html>
