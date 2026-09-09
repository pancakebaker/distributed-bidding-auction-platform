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
    public async Task AnonymousHistoryRoute_IsRejected()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/activity/history");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("auth/required", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task AnonymousReportRoute_IsRejected()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/activity/report.pdf?from=2026-09-01T00:00:00Z&to=2026-09-01T01:00:00Z");

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
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/activity/history")).StatusCode);
        var logout = await client.PostAsync("/auth/logout", new FormUrlEncodedContent(Array.Empty<KeyValuePair<string, string>>()));
        Assert.Equal(HttpStatusCode.Redirect, logout.StatusCode);
        Assert.Contains("Set-Cookie", logout.Headers.ToString());
    }

    [Fact]
    public async Task AuthenticatedReport_ReturnsPdfAndRateLimitsAfterFiveRequests()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        using var content = new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("token", factory.CreateToken()) });
        Assert.Equal(HttpStatusCode.Redirect, (await client.PostAsync("/auth/handoff", content)).StatusCode);
        const string url = "/activity/report.pdf?from=2026-09-01T00:00:00Z&to=2026-09-01T01:00:00Z";

        HttpResponseMessage? first = null;
        for (var index = 0; index < 5; index++)
        {
            var response = await client.GetAsync(url);
            first ??= response;
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            if (index == 0)
            {
                Assert.Equal("application/pdf", response.Content.Headers.ContentType?.MediaType);
                Assert.Equal("attachment", response.Content.Headers.ContentDisposition?.DispositionType);
                Assert.EndsWith(".pdf", response.Content.Headers.ContentDisposition?.FileNameStar ?? response.Content.Headers.ContentDisposition?.FileName);
            }
        }

        Assert.Equal(HttpStatusCode.OK, first!.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, (await client.GetAsync(url)).StatusCode);
    }

    [Fact]
    public async Task HealthEndpoint_ReturnsDependencyStatusWithoutSecrets()
    {
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("postgresql", body, StringComparison.Ordinal);
        Assert.Contains("rabbitmq", body, StringComparison.Ordinal);
        Assert.DoesNotContain("change_me_in_local_env", body, StringComparison.Ordinal);
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
