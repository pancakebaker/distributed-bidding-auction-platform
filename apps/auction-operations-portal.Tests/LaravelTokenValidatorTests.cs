using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace AuctionOperationsPortal.Tests;

public sealed class LaravelTokenValidatorTests : IDisposable
{
    private readonly RSA signingKey = RSA.Create(2048);
    private readonly string publicKeyPath = Path.Combine(Path.GetTempPath(), $"auction-portal-{Guid.NewGuid():N}.pem");
    private readonly LaravelAuthOptions options;

    public LaravelTokenValidatorTests()
    {
        using var publicKey = RSA.Create();
        publicKey.ImportParameters(signingKey.ExportParameters(false));
        File.WriteAllText(publicKeyPath, publicKey.ExportSubjectPublicKeyInfoPem());
        options = new LaravelAuthOptions { PublicKeyPath = publicKeyPath };
    }

    [Fact]
    public void ValidToken_IsAccepted()
    {
        var identity = Validator().Validate(CreateToken());
        Assert.Equal("admin-1", identity.Subject);
        Assert.Equal("admin@example.com", identity.Email);
        Assert.Equal("admin", identity.Role);
    }

    [Theory]
    [InlineData("wrong-audience", null, "invalid-token")]
    [InlineData(null, "wrong-issuer", "invalid-token")]
    public void WrongIssuerOrAudience_IsRejected(string? audience, string? issuer, string expectedCategory)
    {
        var exception = Assert.Throws<PortalTokenValidationException>(() => Validator().Validate(CreateToken(audience: audience, issuer: issuer)));
        Assert.Equal(expectedCategory, exception.Category);
    }

    [Fact]
    public void ExpiredToken_IsRejected() => Assert.Throws<PortalTokenValidationException>(() => Validator().Validate(CreateToken(expiresAt: DateTimeOffset.UtcNow.AddMinutes(-2))));

    [Fact]
    public void InvalidSignature_IsRejected()
    {
        using var otherKey = RSA.Create(2048);
        var exception = Assert.Throws<PortalTokenValidationException>(() => Validator().Validate(CreateToken(key: otherKey)));
        Assert.Equal("invalid-token", exception.Category);
    }

    [Fact]
    public void MissingPermission_IsRejected() => Assert.Throws<PortalTokenValidationException>(() => Validator().Validate(CreateToken(permission: "other-permission")));

    [Fact]
    public void MissingJti_IsRejected() => Assert.Throws<PortalTokenValidationException>(() => Validator().Validate(CreateToken(jti: null)));

    [Fact]
    public void Jti_CannotBeConsumedTwice()
    {
        var validator = Validator();
        var token = CreateToken();
        validator.Validate(token);
        var exception = Assert.Throws<PortalTokenValidationException>(() => validator.Validate(token));
        Assert.Equal("replayed-jti", exception.Category);
    }

    private LaravelTokenValidator Validator() => new(Microsoft.Extensions.Options.Options.Create(options), new PortalReplayProtection(), TimeProvider.System);

    private string CreateToken(
        string? audience = null,
        string? issuer = null,
        string? permission = null,
        string? jti = "jti-1",
        DateTimeOffset? expiresAt = null,
        RSA? key = null)
    {
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, "admin-1"),
            new(JwtRegisteredClaimNames.Email, "admin@example.com"),
            new("role", "admin")
        };
        claims.Add(new("permissions", permission ?? options.Permission));
        if (jti is not null)
            claims.Add(new(JwtRegisteredClaimNames.Jti, jti));

        var now = DateTimeOffset.UtcNow;
        var notBefore = expiresAt is { } expired ? expired.AddMinutes(-5).UtcDateTime : now.UtcDateTime;
        var token = new JwtSecurityToken(
            issuer ?? options.Issuer,
            audience ?? options.Audience,
            claims,
            notBefore,
            (expiresAt ?? now.AddMinutes(5)).UtcDateTime,
            new SigningCredentials(new RsaSecurityKey(key ?? signingKey), SecurityAlgorithms.RsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public void Dispose()
    {
        signingKey.Dispose();
        if (File.Exists(publicKeyPath))
            File.Delete(publicKeyPath);
    }
}
