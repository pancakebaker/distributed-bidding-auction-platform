using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Options;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
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
        Assert.Equal("/activity/live", response.Headers.Location?.ToString());
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
        Assert.Contains("login", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task AnonymousHistoryRoute_IsRejected()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/activity/history");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("login", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task AnonymousReportRoute_IsRejected()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var response = await client.GetAsync("/activity/report.pdf?from=2026-09-01T00:00:00Z&to=2026-09-01T01:00:00Z");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Contains("login", response.Headers.Location?.ToString());
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
        var home = await client.GetAsync("/");
        var antiforgeryToken = ExtractAntiforgeryToken(await home.Content.ReadAsStringAsync());
        var logout = await client.PostAsync(
            "/auth/logout",
            new FormUrlEncodedContent(new[] { new KeyValuePair<string, string>("__RequestVerificationToken", antiforgeryToken) }));
        Assert.Equal(HttpStatusCode.Redirect, logout.StatusCode);
        Assert.Contains("Set-Cookie", logout.Headers.ToString());
    }

    [Fact]
    public async Task LocalSystemAdminLogin_CreatesSharedPortalCookieAndUsesSafeReturnUrl()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login?returnUrl=%2Factivity%2Fhistory");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var response = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", "systemadmin@example.test"),
                new KeyValuePair<string, string>("password", "system-admin-password"),
                new KeyValuePair<string, string>("returnUrl", "/activity/history"),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/activity/history", response.Headers.Location?.ToString());
        Assert.Contains("auction_operations_auth", response.Headers.GetValues("Set-Cookie").Single());
    }

    [Theory]
    [InlineData("systemadmin@example.test", "wrong-password")]
    [InlineData("unknown@example.test", "system-admin-password")]
    public async Task LocalSystemAdminLogin_UsesGenericFailure(string email, string password)
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var response = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", email),
                new KeyValuePair<string, string>("password", password),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));
        var body = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal("Invalid email or password.", body);
        Assert.False(response.Headers.TryGetValues("Set-Cookie", out _));
    }

    [Fact]
    public async Task LocalSystemAdminLogin_RejectsExternalReturnUrl()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login?returnUrl=https%3A%2F%2Fevil.example");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var response = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", "systemadmin@example.test"),
                new KeyValuePair<string, string>("password", "system-admin-password"),
                new KeyValuePair<string, string>("returnUrl", "https://evil.example"),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task LocalSystemAdmin_CanInitiateServerSideLiveFeedHandoff()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var loginResponse = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", "systemadmin@example.test"),
                new KeyValuePair<string, string>("password", "system-admin-password"),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));
        Assert.Equal(HttpStatusCode.Redirect, loginResponse.StatusCode);

        var home = await client.GetAsync("/");
        var handoffToken = ExtractAntiforgeryToken(await home.Content.ReadAsStringAsync());
        var response = await client.PostAsync(
            "/admin/live-feed/access",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("__RequestVerificationToken", handoffToken)
            }));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(
            "http://localhost:3001/admin/auth/handoff?code=test-handoff-code",
            response.Headers.Location?.ToString());
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("http://evil.example")]
    [InlineData("//evil.example")]
    [InlineData("/\\evil.example")]
    [InlineData("\\\\evil.example")]
    public async Task LocalSystemAdminLogin_RejectsUnsafeReturnUrlVariants(string returnUrl)
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var response = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", "systemadmin@example.test"),
                new KeyValuePair<string, string>("password", "system-admin-password"),
                new KeyValuePair<string, string>("returnUrl", returnUrl),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/", response.Headers.Location?.ToString());
    }

    [Fact]
    public async Task LocalSystemAdminLogin_PreservesLocalReturnUrlWithQueryString()
    {
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false, HandleCookies = true });
        var login = await client.GetAsync("/login");
        var token = ExtractAntiforgeryToken(await login.Content.ReadAsStringAsync());
        var returnUrl = "/activity/history?eventType=BidAccepted";
        var response = await client.PostAsync(
            "/auth/login",
            new FormUrlEncodedContent(new[]
            {
                new KeyValuePair<string, string>("email", "systemadmin@example.test"),
                new KeyValuePair<string, string>("password", "system-admin-password"),
                new KeyValuePair<string, string>("returnUrl", returnUrl),
                new KeyValuePair<string, string>("__RequestVerificationToken", token)
            }));

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal(returnUrl, response.Headers.Location?.ToString());
    }

    private static string ExtractAntiforgeryToken(string html)
    {
        var match = Regex.Match(
            html,
            "name=\\\"__RequestVerificationToken\\\"[^>]*value=\\\"([^\\\"]+)\\\"",
            RegexOptions.CultureInvariant);
        return match.Success
            ? match.Groups[1].Value
            : throw new InvalidOperationException("Antiforgery token was not rendered.");
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
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ISystemAdminAccountService>();
            services.AddScoped<ISystemAdminAccountService, TestSystemAdminAccountService>();
            services.RemoveAll<ISystemAdminTokenIssuer>();
            services.AddSingleton<ISystemAdminTokenIssuer, TestSystemAdminTokenIssuer>();
            services.RemoveAll<ILiveFeedAdminHandoffClient>();
            services.AddSingleton<ILiveFeedAdminHandoffClient, TestLiveFeedAdminHandoffClient>();
        });
        builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"{LaravelAuthOptions.SectionName}:PublicKeyPath"] = publicKeyPath,
            [$"{LaravelAuthOptions.SectionName}:LaravelAdminUrl"] = "http://localhost:8000/admin"
        }));
    }

    private sealed class TestSystemAdminTokenIssuer : ISystemAdminTokenIssuer
    {
        public string Issue(SystemAdminUser user, string audience) =>
            user.SubjectId == "system-admin-test-subject" && audience == "live-feed-admin"
                ? "test-system-admin-token"
                : throw new InvalidOperationException();
    }

    private sealed class TestLiveFeedAdminHandoffClient : ILiveFeedAdminHandoffClient
    {
        public Task<string> CreateHandoffAsync(string systemAdminToken, CancellationToken cancellationToken = default) =>
            Task.FromResult(systemAdminToken == "test-system-admin-token"
                ? "test-handoff-code"
                : throw new InvalidOperationException());
    }

    private sealed class TestSystemAdminAccountService : ISystemAdminAccountService
    {
        private readonly PasswordHasher<SystemAdminUser> hasher = new();
        private readonly SystemAdminUser user;

        public TestSystemAdminAccountService()
        {
            user = new SystemAdminUser
            {
                SubjectId = "system-admin-test-subject",
                Email = "systemadmin@example.test",
                NormalizedEmail = "SYSTEMADMIN@EXAMPLE.TEST",
                PasswordHash = string.Empty,
                Role = SystemAdminRoles.SystemAdministrator,
                IsActive = true,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow
            };
            user.PasswordHash = hasher.HashPassword(user, "system-admin-password");
        }

        public Task<SystemAdminUser?> FindActiveByEmailAsync(string email, CancellationToken cancellationToken = default) =>
            Task.FromResult<SystemAdminUser?>(
                SystemAdminAccountService.NormalizeEmail(email) == user.NormalizedEmail && user.IsActive
                    ? user
                    : null);

        public Task<SystemAdminUser?> FindActiveBySubjectIdAsync(
            string subjectId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<SystemAdminUser?>(
                string.Equals(subjectId, user.SubjectId, StringComparison.Ordinal) && user.IsActive
                    ? user
                    : null);

        public PasswordVerificationResult VerifyPassword(SystemAdminUser account, string password) =>
            hasher.VerifyHashedPassword(account, account.PasswordHash, password);
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
