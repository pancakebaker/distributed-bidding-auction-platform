// <copyright file="SystemAdminTokenIssuer.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AuctionOperationsPortal.Auth;

/// <summary>Issues future downstream tokens for independent system-admin consumers.</summary>
public interface ISystemAdminTokenIssuer
{
    /// <summary>Issues a short-lived token for one explicitly configured audience.</summary>
    string Issue(SystemAdminUser user, string audience);
}

/// <summary>RS256 issuer whose claims are derived only from stored account state.</summary>
public sealed class SystemAdminTokenIssuer(
    IOptions<SystemAdminAuthOptions> options,
    TimeProvider timeProvider) : ISystemAdminTokenIssuer
{
    /// <inheritdoc />
    public string Issue(SystemAdminUser user, string audience)
    {
        if (!user.IsActive || !string.Equals(user.Role, SystemAdminRoles.SystemAdministrator, StringComparison.Ordinal))
            throw new InvalidOperationException("Only active system administrators can receive system tokens.");

        var settings = options.Value;
        if (!settings.AllowedAudiences.Contains(audience, StringComparer.Ordinal))
            throw new InvalidOperationException("The requested system-admin audience is not configured.");

        if (settings.TokenLifetimeSeconds is < 60 or > 600)
            throw new InvalidOperationException("System-admin token lifetime must be between 60 and 600 seconds.");

        var privateKeyPath = settings.PrivateKeyPath;
        if (!Path.IsPathRooted(privateKeyPath))
            privateKeyPath = Path.GetFullPath(privateKeyPath);
        if (!File.Exists(privateKeyPath))
            throw new InvalidOperationException("The system-admin signing key is not configured.");

        using var rsa = RSA.Create();
        rsa.ImportFromPem(File.ReadAllText(privateKeyPath));
        var now = timeProvider.GetUtcNow();
        var credentials = new SigningCredentials(
            new RsaSecurityKey(rsa) { KeyId = settings.KeyId },
            SecurityAlgorithms.RsaSha256);
        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: audience,
            claims: BuildClaims(user, now),
            notBefore: now.UtcDateTime,
            expires: now.AddSeconds(settings.TokenLifetimeSeconds).UtcDateTime,
            signingCredentials: credentials);
        token.Header[JwtHeaderParameterNames.Kid] = settings.KeyId;
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static IEnumerable<Claim> BuildClaims(SystemAdminUser user, DateTimeOffset now)
    {
        yield return new Claim(JwtRegisteredClaimNames.Sub, user.SubjectId);
        yield return new Claim("role", user.Role);
        foreach (var permission in SystemAdminPermissions.ForRole(user.Role))
            yield return new Claim("permission", permission);
        yield return new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"));
        yield return new Claim(
            JwtRegisteredClaimNames.Iat,
            now.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture),
            ClaimValueTypes.Integer64);
    }
}
