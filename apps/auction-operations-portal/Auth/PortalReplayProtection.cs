using System.Collections.Concurrent;

namespace AuctionOperationsPortal.Auth;

public sealed class PortalReplayProtection
{
    private readonly ConcurrentDictionary<string, DateTimeOffset> consumed = new(StringComparer.Ordinal);

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
