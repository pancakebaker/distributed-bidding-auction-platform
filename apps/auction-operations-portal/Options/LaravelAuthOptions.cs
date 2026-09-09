namespace AuctionOperationsPortal.Options;

public sealed class LaravelAuthOptions
{
    public const string SectionName = "LaravelAuth";
    public string Issuer { get; set; } = "auction-client";
    public string Audience { get; set; } = "auction-operations-portal";
    public string Permission { get; set; } = "access-auction-operations";
    public string PublicKeyPath { get; set; } = "../live-feed-service/config/live-feed-admin-public.pem";
    public string CookieName { get; set; } = "auction_operations_auth";
    public int CookieLifetimeSeconds { get; set; } = 900;
    public string LaravelBaseUrl { get; set; } = "http://localhost:8000";
    public string LaravelAdminUrl { get; set; } = "http://localhost:8000/admin";
}
