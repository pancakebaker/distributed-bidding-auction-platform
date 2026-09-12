// <copyright file="SystemAdminPermissions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace AuctionOperationsPortal.Auth;

/// <summary>Server-owned permissions for platform system administrators.</summary>
public static class SystemAdminPermissions
{
    /// <summary>Monitors platform activity.</summary>
    public const string Monitor = "system.monitor";

    /// <summary>Uses protected Live Feed administration features.</summary>
    public const string LiveFeedAdmin = "livefeed.admin";

    /// <summary>Uses protected system diagnostics.</summary>
    public const string Diagnostics = "system.diagnostics";

    /// <summary>Gets permissions for a system administrator role.</summary>
    public static IReadOnlyList<string> ForRole(string role) =>
        string.Equals(role, SystemAdminRoles.SystemAdministrator, StringComparison.Ordinal)
            ? [Monitor, LiveFeedAdmin, Diagnostics]
            : [];
}

/// <summary>Platform roles, intentionally separate from tenant-admin roles.</summary>
public static class SystemAdminRoles
{
    /// <summary>The platform monitoring administrator role.</summary>
    public const string SystemAdministrator = "SystemAdministrator";
}
