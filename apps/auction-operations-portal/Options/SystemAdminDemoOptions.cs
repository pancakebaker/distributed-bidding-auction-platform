// <copyright file="SystemAdminDemoOptions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Options;

/// <summary>Local-only system-administrator demo seeding settings.</summary>
public sealed class SystemAdminDemoOptions
{
    /// <summary>Configuration section name.</summary>
    public const string SectionName = "SystemAdminDemo";

    /// <summary>Gets or sets whether development startup seeds the demo account.</summary>
    public bool Enabled { get; set; }

    /// <summary>Gets or sets the demo account email.</summary>
    public string Email { get; set; } = "systemadmin@example.test";

    /// <summary>Gets or sets the demo password.</summary>
    public string Password { get; set; } = "system-admin-password";
}
