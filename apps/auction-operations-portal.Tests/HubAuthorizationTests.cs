using System.Reflection;
using AuctionOperationsPortal.Hubs;
using Microsoft.AspNetCore.Authorization;

namespace AuctionOperationsPortal.Tests;

public sealed class HubAuthorizationTests
{
    [Fact]
    public void ActivityHub_RequiresAuctionOperationsAdminPolicy()
    {
        var attribute = typeof(ActivityHub).GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(attribute);
        Assert.Equal("AuctionOperationsAdmin", attribute!.Policy);
    }

    [Fact]
    public void ActivityHub_ExposesNoBrowserInvokableDomainCommands()
    {
        var publicMethods = typeof(ActivityHub).GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);

        Assert.DoesNotContain(publicMethods, method => method.Name is not "OnConnectedAsync" and not "OnDisconnectedAsync");
    }
}
