<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Opening Live Feed Operations</title>
</head>
<body>
    <main>
        <h1>Opening Live Feed Operations</h1>
        <p>Your Laravel admin session is being exchanged for a short-lived Live Feed session.</p>
        <form id="live-feed-token-exchange" method="post" action="{{ $serviceUrl }}/admin/auth/token">
            <input type="hidden" name="token" value="{{ $token['token'] }}">
            <noscript><button type="submit">Continue</button></noscript>
        </form>
    </main>
    <script>
        document.getElementById('live-feed-token-exchange').submit();
    </script>
</body>
</html>