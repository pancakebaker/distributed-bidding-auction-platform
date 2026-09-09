using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Messaging;
using AuctionOperationsPortal.Notifications;
using AuctionOperationsPortal.Persistence;
using Microsoft.Extensions.DependencyInjection;

namespace AuctionOperationsPortal.Tests;

public sealed class DependencyInjectionTests : IClassFixture<AuthenticationEndpointFactory>
{
    private readonly AuthenticationEndpointFactory factory;

    public DependencyInjectionTests(AuthenticationEndpointFactory factory) => this.factory = factory;

    [Fact]
    public void TestingHost_ValidatesLifetimesAndResolvesRepresentativeServices()
    {
        using var scope = factory.Services.CreateScope();
        Assert.IsType<LaravelTokenValidator>(factory.Services.GetRequiredService<LaravelTokenValidator>());
        Assert.IsType<RabbitMqTopology>(factory.Services.GetRequiredService<RabbitMqTopology>());
        Assert.IsAssignableFrom<IActivityPersistence>(scope.ServiceProvider.GetRequiredService<IActivityPersistence>());
        Assert.IsAssignableFrom<IActivityHistoryQueryService>(scope.ServiceProvider.GetRequiredService<IActivityHistoryQueryService>());
        Assert.IsAssignableFrom<IActivityReportService>(scope.ServiceProvider.GetRequiredService<IActivityReportService>());
        Assert.IsAssignableFrom<IActivityNotificationPublisher>(factory.Services.GetRequiredService<IActivityNotificationPublisher>());
    }
}
