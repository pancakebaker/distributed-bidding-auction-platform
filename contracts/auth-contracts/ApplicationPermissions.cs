// <copyright file="ApplicationPermissions.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
namespace DistributedBidding.AuthContracts;

/// <summary>Defines application-specific permission values shared by auth participants.</summary>
public static class ApplicationPermissions
{
    /// <summary>Authorizes access to the Auction Operations Portal.</summary>
    public const string AccessAuctionOperations = "access-auction-operations";

    /// <summary>Authorizes access to live-feed administration.</summary>
    public const string AccessLiveFeedAdmin = "access-live-feed-admin";
}
