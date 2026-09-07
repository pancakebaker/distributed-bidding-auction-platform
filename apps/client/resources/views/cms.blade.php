<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ $cmsBootstrap['page'] === 'page' ? $cmsBootstrap['props']['title'] : 'FAQs' }} - Distributed Bidding Auction Platform</title>
        @viteReactRefresh
        @vite(['resources/css/app.css', 'resources/js/cms/PublicCmsApp.tsx'])
    </head>
    <body>
        <div id="cms-app"></div>
        <script>
            window.__CMS_BOOTSTRAP__ = {{ Illuminate\Support\Js::from($cmsBootstrap) }};
        </script>
    </body>
</html>
