// <copyright file="SystemAdminSeeder.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Auth;

/// <summary>Seeds the local-only system-admin account without changing existing credentials.</summary>
public sealed class SystemAdminSeeder(
    AuctionOperationsDbContext db,
    IPasswordHasher<SystemAdminUser> passwordHasher,
    IOptions<SystemAdminDemoOptions> options,
    TimeProvider timeProvider)
{
    /// <summary>Creates the configured demo account when it does not already exist.</summary>
    public async Task SeedAsync(CancellationToken cancellationToken = default)
    {
        var settings = options.Value;
        var normalizedEmail = SystemAdminAccountService.NormalizeEmail(settings.Email);
        if (await db.SystemAdminUsers.AnyAsync(
                user => user.NormalizedEmail == normalizedEmail,
                cancellationToken))
            return;

        var now = timeProvider.GetUtcNow();
        var user = new SystemAdminUser
        {
            SubjectId = Guid.NewGuid().ToString("D"),
            Email = settings.Email.Trim(),
            NormalizedEmail = normalizedEmail,
            Role = SystemAdminRoles.SystemAdministrator,
            IsActive = true,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
            PasswordHash = string.Empty
        };
        user.PasswordHash = passwordHasher.HashPassword(user, settings.Password);
        db.SystemAdminUsers.Add(user);
        await db.SaveChangesAsync(cancellationToken);
    }
}
