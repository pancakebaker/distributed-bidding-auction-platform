// <copyright file="PortalReplayProtection.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Collections.Concurrent;

namespace AuctionOperationsPortal.Auth;

/// <summary>Tracks consumed token identifiers until their expiration.</summary>
public sealed class PortalReplayProtection
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> consumed = new(StringComparer.Ordinal);

    /// <summary>Consumes a token identifier when it has not already been seen.</summary>
    public bool TryConsume(string jti, DateTimeOffset expiresAt, DateTimeOffset now)
    {
        foreach (var entry in consumed)
        {
            if (entry.Value <= now)
                consumed.TryRemove(entry.Key, out _);
        }

        return consumed.TryAdd(jti, expiresAt);
    }
}
