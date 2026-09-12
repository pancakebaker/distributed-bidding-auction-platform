// <copyright file="SystemAdminSessionOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configuration for the interactive Operations Portal cookie session.</summary>
public sealed class SystemAdminSessionOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "SystemAdminSession";

    /// <summary>Gets or sets the shared portal cookie name.</summary>
    public string CookieName { get; set; } = "auction_operations_auth";

    /// <summary>Gets or sets the interactive session lifetime in minutes.</summary>
    public int LifetimeMinutes { get; set; } = 20;

    /// <summary>Validates production session settings.</summary>
    public void Validate(bool allowDevelopmentDefaults)
    {
        if (allowDevelopmentDefaults)
            return;

        if (string.IsNullOrWhiteSpace(CookieName) || LifetimeMinutes is < 15 or > 30)
        {
            throw new InvalidOperationException(
                "SystemAdminSession requires a cookie name and a 15-30 minute lifetime.");
        }
    }
}
