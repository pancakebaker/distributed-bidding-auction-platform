namespace auction_scheduler.Outbox;

public static class IntegrationEventTypes
{
    public const string AuctionClosed = "AuctionClosed";
    public const string WinnerSelected = "WinnerSelected";
}
