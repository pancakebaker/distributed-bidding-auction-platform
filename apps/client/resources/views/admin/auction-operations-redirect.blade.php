<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Opening Auction Operations</title>
</head>
<body>
    <main>
        <h1>Opening Auction Operations</h1>
        <p>Your Laravel admin session is being exchanged for a short-lived portal session.</p>
        <form id="auction-operations-handoff" method="post" action="{{ $handoffUrl }}">
            <input type="hidden" name="token" value="{{ $token }}">
            <noscript><button type="submit">Continue</button></noscript>
        </form>
    </main>
    <script>document.getElementById('auction-operations-handoff').submit();</script>
</body>
</html>
