using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace bidding_service.Data;

public sealed class DatabaseInitializer(
    IServiceScopeFactory scopeFactory,
    IOptions<DatabaseOptions> options,
    TimeProvider timeProvider,
    ILogger<DatabaseInitializer> logger)
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<BiddingDbContext>();

        if (options.Value.ApplyMigrations)
        {
            await db.Database.MigrateAsync(cancellationToken);
        }

        if (options.Value.SeedDemoData)
        {
            await DatabaseSeeder.SeedAsync(db, timeProvider, cancellationToken);
            logger.LogInformation("Demo auction seed data is ready.");
        }
    }
}
