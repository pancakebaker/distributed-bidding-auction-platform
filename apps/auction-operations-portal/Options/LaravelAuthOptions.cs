// <copyright file="LaravelAuthOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configures the Laravel-to-portal administrator handoff.</summary>
public sealed class LaravelAuthOptions
{
    /// <summary>Gets the configuration section name.</summary>
    public const string SectionName = "LaravelAuth";
    /// <summary>Gets or sets the expected token issuer.</summary>
    public string Issuer { get; set; } = "auction-client";
    /// <summary>Gets or sets the expected token audience.</summary>
    public string Audience { get; set; } = "auction-operations-portal";
    /// <summary>Gets or sets the required administrator permission.</summary>
    public string Permission { get; set; } = "access-auction-operations";
    /// <summary>Gets or sets the Laravel public key path.</summary>
    public string PublicKeyPath { get; set; } =
        "../live-feed-service/config/live-feed-admin-public.pem";
    /// <summary>Gets or sets the portal authentication cookie name.</summary>
    public string CookieName { get; set; } = "auction_operations_auth";
    /// <summary>Gets or sets the authentication cookie lifetime in seconds.</summary>
    public int CookieLifetimeSeconds { get; set; } = 900;
    /// <summary>Gets or sets the Laravel base URL.</summary>
    public string LaravelBaseUrl { get; set; } = "http://localhost:8000";
    /// <summary>Gets or sets the Laravel administrator URL.</summary>
    public string LaravelAdminUrl { get; set; } = "http://localhost:8000/admin";
}
