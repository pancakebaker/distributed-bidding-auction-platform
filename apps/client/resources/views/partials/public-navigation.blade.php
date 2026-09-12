<nav class="public-navigation" aria-label="Public navigation">
    <div class="public-navigation-inner">
        <a class="public-navigation-brand" href="{{ route('auctions.index') }}">
            Distributed Bidding Auction Platform
        </a>
        <div class="public-navigation-links">
            <a href="{{ route('auctions.index') }}">Auctions</a>
            @foreach ($publicNavigationPages as $page)
                <a
                    href="{{ route('cms.pages.show', ['page' => $page['slug']]) }}"
                >{{ $page['title'] }}</a>
            @endforeach
            @auth
                <span aria-label="Signed-in user">{{ auth()->user()->name }}</span>
                <form method="post" action="{{ route('logout') }}">
                    @csrf
                    <button type="submit">Log out</button>
                </form>
            @else
                <a href="{{ route('login') }}">Sign in</a>
            @endauth
        </div>
    </div>
</nav>
