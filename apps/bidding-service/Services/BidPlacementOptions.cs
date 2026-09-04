namespace bidding_service.Services;

public sealed class BidPlacementOptions
{
    public const string SectionName = "BidPlacement";

    public int MaxConcurrencyRetries { get; set; } = 2;

    public int ArtificialProcessingDelayMilliseconds { get; set; } = 0;
}
