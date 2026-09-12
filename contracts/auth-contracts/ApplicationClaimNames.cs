// <copyright file="ApplicationClaimNames.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace DistributedBidding.AuthContracts;

/// <summary>Defines application-specific JWT claim names shared by auth participants.</summary>
public static class ApplicationClaimNames
{
    /// <summary>Identifies the application role claim.</summary>
    public const string Role = "role";

    /// <summary>Identifies the application permissions claim.</summary>
    public const string Permissions = "permissions";

    /// <summary>Identifies the stable tenant context when multi-tenancy is enabled.</summary>
    public const string TenantId = "tenant_id";
}
