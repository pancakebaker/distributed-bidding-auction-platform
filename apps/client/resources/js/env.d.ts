interface ImportMetaEnv {
    readonly VITE_BIDDING_API_URL?: string;
    readonly VITE_LIVE_FEED_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
