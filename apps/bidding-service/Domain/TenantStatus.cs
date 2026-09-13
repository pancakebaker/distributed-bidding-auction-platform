// <copyright file="TenantStatus.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace bidding_service.Domain;

/// <summary>
/// Describes whether a tenant is currently available for future tenant-aware operations.
/// MT1 persists these values; enforcement is deferred to later tenancy phases.
/// </summary>
public enum TenantStatus
{
    /// <summary>The tenant is available for normal operations.</summary>
    Active,
    /// <summary>The tenant is retained but future enforcement may restrict operations.</summary>
    Suspended,
    /// <summary>The tenant is retained but future enforcement may block access.</summary>
    Disabled
}
