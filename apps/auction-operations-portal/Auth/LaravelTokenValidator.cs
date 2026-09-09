using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.Json;
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AuctionOperationsPortal.Auth;

public sealed record PortalTokenIdentity(string Subject, string? Email, string Role, DateTimeOffset ExpiresAt);

public sealed class LaravelTokenValidator
{
    private readonly LaravelAuthOptions options;
    private readonly PortalReplayProtection replayProtection;
    private readonly TimeProvider timeProvider;
    private readonly TokenValidationParameters validationParameters;
    private readonly JwtSecurityTokenHandler tokenHandler = new();

    public LaravelTokenValidator(
        IOptions<LaravelAuthOptions> options,
        PortalReplayProtection replayProtection,
        TimeProvider timeProvider)
    {
        this.options = options.Value;
        this.replayProtection = replayProtection;
        this.timeProvider = timeProvider;

        var keyPath = Path.IsPathRooted(this.options.PublicKeyPath)
            ? this.options.PublicKeyPath
            : Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, this.options.PublicKeyPath));
        if (!File.Exists(keyPath))
            throw new InvalidOperationException($"Laravel public key was not found at '{keyPath}'.");

        using var rsa = RSA.Create();
        rsa.ImportFromPem(File.ReadAllText(keyPath));
        validationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new RsaSecurityKey(rsa.ExportParameters(false)),
            ValidateIssuer = true,
            ValidIssuer = this.options.Issuer,
            ValidateAudience = true,
            ValidAudience = this.options.Audience,
            ValidateLifetime = true,
            RequireExpirationTime = true,
            RequireSignedTokens = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],
            NameClaimType = ClaimTypes.NameIdentifier,
            RoleClaimType = ClaimTypes.Role
        };
    }

    public PortalTokenIdentity Validate(string token)
    {
        if (string.IsNullOrWhiteSpace(token))
            throw new PortalTokenValidationException("missing-token");

        ClaimsPrincipal principal;
        SecurityToken validatedToken;
        try
        {
            principal = tokenHandler.ValidateToken(token, validationParameters, out validatedToken);
        }
        catch (Exception exception) when (exception is SecurityTokenException or ArgumentException)
        {
            throw new PortalTokenValidationException("invalid-token", exception);
        }

        if (validatedToken is not JwtSecurityToken jwt || !string.Equals(jwt.Header.Alg, SecurityAlgorithms.RsaSha256, StringComparison.Ordinal))
            throw new PortalTokenValidationException("invalid-algorithm");

        var subject = jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Sub)?.Value ?? principal.FindFirstValue(ClaimTypes.NameIdentifier);
        var jti = jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Jti)?.Value;
        var role = jwt.Claims.FirstOrDefault(c => c.Type == "role")?.Value ?? principal.FindFirstValue(ClaimTypes.Role);
        var permissionValues = principal.Claims
            .Where(c => c.Type == "permissions" || c.Type.EndsWith("/permissions", StringComparison.Ordinal))
            .SelectMany(c => ReadPermissionValues(c.Value))
            .ToArray();

        if (string.IsNullOrWhiteSpace(subject))
            throw new PortalTokenValidationException("missing-subject");
        if (string.IsNullOrWhiteSpace(jti))
            throw new PortalTokenValidationException("missing-jti");
        if (!string.Equals(role, "admin", StringComparison.OrdinalIgnoreCase) || !permissionValues.Contains(options.Permission, StringComparer.Ordinal))
            throw new PortalTokenValidationException("missing-permission");

        var expiresAt = new DateTimeOffset(jwt.ValidTo, TimeSpan.Zero);
        if (!replayProtection.TryConsume(jti, expiresAt, timeProvider.GetUtcNow()))
            throw new PortalTokenValidationException("replayed-jti");

        return new PortalTokenIdentity(subject, jwt.Claims.FirstOrDefault(c => c.Type == JwtRegisteredClaimNames.Email)?.Value ?? principal.FindFirstValue(ClaimTypes.Email), role!, expiresAt);
    }

    private static string[] ReadPermissionValues(string value)
    {
        if (value.Length == 0 || value[0] != '[')
            return [value];

        try
        {
            return JsonSerializer.Deserialize<string[]>(value) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}

public sealed class PortalTokenValidationException(string category, Exception? inner = null) : Exception(category, inner)
{
    public string Category { get; } = category;
}
