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
        </div>
    </div>
</nav>
