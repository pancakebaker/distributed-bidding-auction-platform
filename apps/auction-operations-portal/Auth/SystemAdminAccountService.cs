// <copyright file="SystemAdminAccountService.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using AuctionOperationsPortal.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace AuctionOperationsPortal.Auth;

/// <summary>Provides server-side system-admin account lookup and password verification.</summary>
public interface ISystemAdminAccountService
{
    /// <summary>Finds an active account by login email.</summary>
    Task<SystemAdminUser?> FindActiveByEmailAsync(string email, CancellationToken cancellationToken = default);

    /// <summary>Verifies a password without exposing password storage details to callers.</summary>
    PasswordVerificationResult VerifyPassword(SystemAdminUser user, string password);
}

/// <summary>EF-backed system-admin account service.</summary>
public sealed class SystemAdminAccountService(
    AuctionOperationsDbContext db,
    IPasswordHasher<SystemAdminUser> passwordHasher) : ISystemAdminAccountService
{
    /// <inheritdoc />
    public Task<SystemAdminUser?> FindActiveByEmailAsync(
        string email,
        CancellationToken cancellationToken = default)
    {
        var normalized = NormalizeEmail(email);
        return db.SystemAdminUsers
            .SingleOrDefaultAsync(
                user => user.NormalizedEmail == normalized && user.IsActive,
                cancellationToken);
    }

    /// <inheritdoc />
    public PasswordVerificationResult VerifyPassword(SystemAdminUser user, string password) =>
        passwordHasher.VerifyHashedPassword(user, user.PasswordHash, password);

    /// <summary>Normalizes a login identifier consistently for lookup and seeding.</summary>
    public static string NormalizeEmail(string email) => email.Trim().ToUpperInvariant();
}
