namespace auction_scheduler.Options;

public sealed class SchedulerOptions
{
    public const string SectionName = "Scheduler";

    public int PollIntervalSeconds { get; init; } = 1;
    public int BatchSize { get; init; } = 20;

    public TimeSpan PollInterval => TimeSpan.FromSeconds(Math.Max(1, PollIntervalSeconds));
    public int EffectiveBatchSize => Math.Clamp(BatchSize, 1, 100);
}
