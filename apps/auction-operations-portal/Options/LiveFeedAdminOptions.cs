// <copyright file="LiveFeedAdminOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configuration for the server-side Operations Portal to Live Feed handoff.</summary>
public sealed class LiveFeedAdminOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "LiveFeedAdmin";

    /// <summary>Gets or sets the Live Feed base URL.</summary>
    public string BaseUrl { get; set; } = "http://localhost:3001";

    /// <summary>Gets or sets the server-to-server token exchange path.</summary>
    public string SystemTokenEndpoint { get; set; } = "/admin/auth/system-token";

    /// <summary>Gets or sets the browser opaque-code handoff path.</summary>
    public string BrowserHandoffEndpoint { get; set; } = "/admin/auth/handoff";

    /// <summary>Validates non-development handoff settings.</summary>
    public void Validate(bool allowDevelopmentDefaults)
    {
        if (allowDevelopmentDefaults)
            return;

        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out var baseUri)
            || baseUri.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrWhiteSpace(SystemTokenEndpoint)
            || string.IsNullOrWhiteSpace(BrowserHandoffEndpoint))
        {
            throw new InvalidOperationException(
                "LiveFeedAdmin requires an absolute HTTP(S) base URL and handoff paths.");
        }
    }
}
