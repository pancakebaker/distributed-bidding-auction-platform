// <copyright file="SystemAdminAuthOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Configuration for the independent system-administrator token issuer.</summary>
public sealed class SystemAdminAuthOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "SystemAdminAuth";

    /// <summary>Gets or sets the token issuer.</summary>
    public string Issuer { get; set; } = "dbap-system-admin";

    /// <summary>Gets or sets the signing key identifier.</summary>
    public string KeyId { get; set; } = "system-admin-development-1";

    /// <summary>Gets or sets the private signing key path.</summary>
    public string PrivateKeyPath { get; set; } = "keys/system-admin-private.pem";

    /// <summary>Gets or sets the permitted downstream audiences.</summary>
    public List<string> AllowedAudiences { get; set; } =
        ["auction-operations-portal", "live-feed-admin"];

    /// <summary>Gets or sets the token lifetime in seconds.</summary>
    public int TokenLifetimeSeconds { get; set; } = 300;

    /// <summary>Validates production-required issuer configuration.</summary>
    public void Validate(bool allowDevelopmentDefaults)
    {
        if (allowDevelopmentDefaults)
        {
            return;
        }

        if (string.IsNullOrWhiteSpace(Issuer)
            || string.IsNullOrWhiteSpace(KeyId)
            || string.IsNullOrWhiteSpace(PrivateKeyPath)
            || AllowedAudiences.Count == 0
            || TokenLifetimeSeconds is < 60 or > 600
            || !File.Exists(PrivateKeyPath))
        {
            throw new InvalidOperationException(
                "SystemAdminAuth requires a valid issuer, key ID, private key, audience, and 60-600 second lifetime.");
        }
    }
}
