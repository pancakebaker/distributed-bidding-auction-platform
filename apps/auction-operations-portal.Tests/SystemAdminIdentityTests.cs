using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Options;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Tests;

public sealed class SystemAdminIdentityTests : IDisposable
{
    private readonly string privateKeyPath = Path.Combine(
        Path.GetTempPath(),
        $"system-admin-{Guid.NewGuid():N}.pem");

    [Fact]
    public void SystemAdministratorPermissions_ArePlatformOnly()
    {
        var permissions = SystemAdminPermissions.ForRole(SystemAdminRoles.SystemAdministrator);

        Assert.Equal(
            ["system.monitor", "livefeed.admin", "system.diagnostics"],
            permissions);
        Assert.DoesNotContain("auction.manage", permissions);
        Assert.DoesNotContain("auction.bid", permissions);
        Assert.DoesNotContain("auction.buy", permissions);
    }

    [Fact]
    public void PasswordHasher_StoresHashAndVerifiesConfiguredPassword()
    {
        var user = NewUser();
        var hasher = new PasswordHasher<SystemAdminUser>();
        var hash = hasher.HashPassword(user, "system-admin-password");

        Assert.NotEqual("system-admin-password", hash);
        Assert.Equal(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(user, hash, "system-admin-password"));
        Assert.NotEqual(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(user, hash, "wrong-password"));
    }

    [Fact]
    public async Task Seeder_IsIdempotentAndRetainsSubjectId()
    {
        await using var db = CreateDb();
        var hasher = new PasswordHasher<SystemAdminUser>();
        var options = Microsoft.Extensions.Options.Options.Create(new SystemAdminDemoOptions
        {
            Enabled = true,
            Email = "systemadmin@example.test",
            Password = "configured-demo-password"
        });
        var seeder = new SystemAdminSeeder(db, hasher, options, TimeProvider.System);

        await seeder.SeedAsync();
        var first = await db.SystemAdminUsers.SingleAsync();
        var subject = first.SubjectId;
        var passwordHash = first.PasswordHash;
        await seeder.SeedAsync();

        var second = await db.SystemAdminUsers.SingleAsync();
        Assert.Equal(1, await db.SystemAdminUsers.CountAsync());
        Assert.Equal(subject, second.SubjectId);
        Assert.Equal(passwordHash, second.PasswordHash);
        Assert.Equal(SystemAdminRoles.SystemAdministrator, second.Role);
        Assert.True(second.IsActive);
        Assert.Equal(
            PasswordVerificationResult.Success,
            hasher.VerifyHashedPassword(second, second.PasswordHash, "configured-demo-password"));
    }

    [Fact]
    public void TokenIssuer_EmitsStableSubjectKidAndPlatformPermissions()
    {
        using var rsa = RSA.Create(2048);
        File.WriteAllText(privateKeyPath, rsa.ExportPkcs8PrivateKeyPem());
        var user = NewUser();
        var issuer = new SystemAdminTokenIssuer(
            Microsoft.Extensions.Options.Options.Create(new SystemAdminAuthOptions
            {
                Issuer = "dbap-system-admin",
                KeyId = "system-admin-2026-01",
                PrivateKeyPath = privateKeyPath,
                AllowedAudiences = ["auction-operations-portal"],
                TokenLifetimeSeconds = 300
            }),
            TimeProvider.System);

        var raw = issuer.Issue(user, "auction-operations-portal");
        var token = new JwtSecurityTokenHandler().ReadJwtToken(raw);

        Assert.Equal("RS256", token.Header.Alg);
        Assert.Equal("system-admin-2026-01", token.Header.Kid);
        Assert.Equal("dbap-system-admin", token.Issuer);
        Assert.Equal("auction-operations-portal", token.Audiences.Single());
        Assert.Equal(user.SubjectId, token.Subject);
        Assert.Equal(SystemAdminRoles.SystemAdministrator, token.Claims.Single(c => c.Type == "role").Value);
        Assert.Contains(token.Claims, c => c.Type == "permission" && c.Value == SystemAdminPermissions.Monitor);
        Assert.DoesNotContain(token.Claims, c => c.Value == "auction.manage");
        Assert.DoesNotContain(token.Claims, c => c.Value.Contains("Password", StringComparison.OrdinalIgnoreCase));
        Assert.False(string.IsNullOrWhiteSpace(token.Id));
        Assert.InRange(token.ValidTo - token.IssuedAt, TimeSpan.FromSeconds(60), TimeSpan.FromSeconds(600));
    }

    [Fact]
    public void TokenIssuer_RejectsUnconfiguredAudienceAndUnsafeLifetime()
    {
        using var rsa = RSA.Create(2048);
        File.WriteAllText(privateKeyPath, rsa.ExportPkcs8PrivateKeyPem());
        var user = NewUser();
        var settings = new SystemAdminAuthOptions
        {
            PrivateKeyPath = privateKeyPath,
            AllowedAudiences = ["auction-operations-portal"],
            TokenLifetimeSeconds = 601
        };
        var issuer = new SystemAdminTokenIssuer(
            Microsoft.Extensions.Options.Options.Create(settings),
            TimeProvider.System);

        Assert.Throws<InvalidOperationException>(() => issuer.Issue(user, "live-feed-admin"));
        Assert.Throws<InvalidOperationException>(() => issuer.Issue(user, "auction-operations-portal"));
    }

    [Fact]
    public void ProductionConfiguration_RequiresSigningMaterial()
    {
        var options = new SystemAdminAuthOptions { PrivateKeyPath = privateKeyPath };

        Assert.Throws<InvalidOperationException>(() => options.Validate(allowDevelopmentDefaults: false));
        options.Validate(allowDevelopmentDefaults: true);
    }

    [Fact]
    public void Model_DeclaresUniqueSubjectAndLoginIndexes()
    {
        using var db = CreateDb();
        var entity = db.Model.FindEntityType(typeof(SystemAdminUser))!;

        Assert.Contains(entity.GetIndexes(), index => index.IsUnique
            && index.Properties.Single().Name == nameof(SystemAdminUser.SubjectId));
        Assert.Contains(entity.GetIndexes(), index => index.IsUnique
            && index.Properties.Single().Name == nameof(SystemAdminUser.NormalizedEmail));
    }

    private AuctionOperationsDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AuctionOperationsDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AuctionOperationsDbContext(options);
    }

    private static SystemAdminUser NewUser() => new()
    {
        SubjectId = "6f8e0b4d-0e6a-4ae5-8458-4cf3a8b9f1a2",
        Email = "systemadmin@example.test",
        NormalizedEmail = "SYSTEMADMIN@EXAMPLE.TEST",
        PasswordHash = "unused",
        Role = SystemAdminRoles.SystemAdministrator,
        IsActive = true,
        CreatedAtUtc = DateTimeOffset.UtcNow,
        UpdatedAtUtc = DateTimeOffset.UtcNow
    };

    public void Dispose()
    {
        if (File.Exists(privateKeyPath))
            File.Delete(privateKeyPath);
    }
}
