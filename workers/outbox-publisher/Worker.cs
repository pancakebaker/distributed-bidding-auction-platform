using Microsoft.Extensions.Options;
using outbox_publisher.Options;
using outbox_publisher.Outbox;

namespace outbox_publisher;

public sealed class Worker(
    OutboxPublishingService publishingService,
    IOptions<PublisherOptions> options,
    ILogger<Worker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var pollInterval = TimeSpan.FromSeconds(Math.Max(1, options.Value.PollIntervalSeconds));
        logger.LogInformation("Outbox publisher started. PollIntervalSeconds: {PollIntervalSeconds}, BatchSize: {BatchSize}", pollInterval.TotalSeconds, options.Value.BatchSize);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var published = await publishingService.PublishOnceAsync(stoppingToken);
                if (published == 0)
                {
                    await Task.Delay(pollInterval, stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Outbox publisher loop failed. It will retry after the poll interval.");
                await Task.Delay(pollInterval, stoppingToken);
            }
        }
    }
}
