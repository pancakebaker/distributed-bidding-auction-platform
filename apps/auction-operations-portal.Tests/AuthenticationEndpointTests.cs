using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using AuctionOperationsPortal.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace AuctionOperationsPortal.Tests;

public sealed class AuthenticationEndpointTests : IClassFixture<AuthenticationEndpointFactory>
{
    private readonly AuthenticationEndpointFactory factory;

    public AuthenticationEndpointTests(AuthenticationEndpointFactory factory) => this.factory = factory;

    [Fact]
    public async Task ValidHandoff_CreatesShortLivedCookieAndRedirects()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("token", factory.CreateToken()) });
        var response = await client.PostAsync("/auth/handoff", content);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("auction_operations_auth", response.Headers.GetValues("Set-Cookie").Single());
    }

    [Fact]
    public async Task InvalidHandoff_DoesNotCreateCookie()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        using var content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("token", "invalid") });
        var response = await client.PostAsync("/auth/handoff", content);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.False(response.Headers.TryGetValues("Set-Cookie", out _));
    }

    [Fact]
    public async Task AnonymousPortalRoute_IsRejected()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/");
        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("auth/required", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task AuthenticatedPortalRoute_IsAccessibleAndLogoutClearsCookie()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        using var content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("token", factory.CreateToken()) });
        var handoff = await client.PostAsync("/auth/handoff", content);
        Assert.Equal(HttpStatusCode.Redirect, handoff.StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/")).StatusCode);
        var logout = await client.PostAsync("/auth/logout", new FormUrlEncodedContent(Array.Empty<KeyValuePair<string, string>>()));
        Assert.Equal(HttpStatusCode.Redirect, logout.StatusCode);
        Assert.Contains("Set-Cookie", logout.Headers.ToString());
    }
}

public sealed class AuthenticationEndpointFactory : WebApplicationFactory<Program>
{
    private readonly RSA signingKey = RSA.Create(2048);
    private readonly string publicKeyPath = Path.Combine(Path.GetTempPath(), $"auction-portal-endpoint-{Guid.NewGuid():N}.pem");

    public AuthenticationEndpointFactory()
    {
        using var publicKey = RSA.Create();
        publicKey.ImportParameters(signingKey.ExportParameters(false));
        File.WriteAllText(publicKeyPath, publicKey.ExportSubjectPublicKeyInfoPem());
    }

    protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"{LaravelAuthOptions.SectionName}:PublicKeyPath"] = publicKeyPath,
            [$"{LaravelAuthOptions.SectionName}:LaravelAdminUrl"] = "http://localhost:8000/admin"
        }));
    }

    public string CreateToken()
    {
        var now = DateTimeOffset.UtcNow;
        var token = new JwtSecurityToken(
            "auction-client",
            "auction-operations-portal",
            new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, "admin-1"),
                new Claim(JwtRegisteredClaimNames.Email, "admin@example.com"),
                new Claim("role", "admin"),
                new Claim("permissions", "access-auction-operations"),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N"))
            },
            now.UtcDateTime,
            now.AddMinutes(5).UtcDateTime,
            new SigningCredentials(new RsaSecurityKey(signingKey), SecurityAlgorithms.RsaSha256));
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            signingKey.Dispose();
            if (File.Exists(publicKeyPath))
                File.Delete(publicKeyPath);
        }
        base.Dispose(disposing);
    }
}
