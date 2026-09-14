// <copyright file="BiddingServiceOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configures the Operations Portal's server-side Bidding client.</summary>
public sealed class BiddingServiceOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "BiddingService";

    /// <summary>Gets or sets the Bidding Service base URL.</summary>
    public string BaseUrl { get; set; } = "http://localhost:5000";

    /// <summary>Gets or sets the system-admin status endpoint path.</summary>
    public string TenantEndpoint { get; set; } = "/api/system/tenants";
}
