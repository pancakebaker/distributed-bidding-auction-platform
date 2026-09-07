<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Admin - Distributed Bidding Auction Platform</title>
        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/admin/AdminApp.tsx'])
    </head>
    <body>
        @auth
            <form class="admin-logout" method="post" action="{{ route('logout') }}">
                @csrf
                <button type="submit">Log out</button>
            </form>
        @endauth
        <div id="admin-app"></div>
        <script>
            window.__ADMIN_BOOTSTRAP__ = {{ Illuminate\Support\Js::from($adminBootstrap) }};
        </script>
    </body>
</html>
