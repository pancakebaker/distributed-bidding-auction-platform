// <copyright file="SystemAdminUser.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Data;

/// <summary>Stores a platform system-administrator identity.</summary>
public sealed class SystemAdminUser
{
    /// <summary>Gets or sets the internal database identifier.</summary>
    public long Id { get; set; }

    /// <summary>Gets or sets the stable opaque subject used by future tokens.</summary>
    public required string SubjectId { get; set; }

    /// <summary>Gets or sets the login email.</summary>
    public required string Email { get; set; }

    /// <summary>Gets or sets the normalized login email.</summary>
    public required string NormalizedEmail { get; set; }

    /// <summary>Gets or sets the adaptive password hash.</summary>
    public required string PasswordHash { get; set; }

    /// <summary>Gets or sets the platform role.</summary>
    public required string Role { get; set; }

    /// <summary>Gets or sets whether the account can authenticate.</summary>
    public bool IsActive { get; set; }

    /// <summary>Gets or sets the creation time in UTC.</summary>
    public DateTimeOffset CreatedAtUtc { get; set; }

    /// <summary>Gets or sets the last update time in UTC.</summary>
    public DateTimeOffset UpdatedAtUtc { get; set; }
}
