using System.Net;
using System.Security.Claims;
using System.Text;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Data;
using AuctionOperationsPortal.Options;
using AuctionOperationsPortal.Services;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Tests;

public sealed class TenantAdministrationClientTests
{
    [Fact]
    public async Task LoadsTenantsThroughSystemAdministratorBearerToken()
    {
        var tenantId = Guid.NewGuid();
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $"[{{\"tenantId\":\"{tenantId}\",\"name\":\"Demo\",\"status\":\"Suspended\",\"version\":2,\"updatedAtUtc\":\"2026-01-01T00:00:00Z\"}}]",
                Encoding.UTF8,
                "application/json")
        });
        var client = CreateClient(handler);

        var tenants = await client.GetTenantsAsync(Principal());

        var tenant = Assert.Single(tenants);
        Assert.Equal(tenantId, tenant.TenantId);
        Assert.Equal(TenantLifecycleStatus.Suspended, tenant.Status);
        Assert.Equal("Bearer test-token", handler.Authorization);
    }

    [Fact]
    public async Task SendsExpectedVersionAndMapsConflict()
    {
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.Conflict));
        var client = CreateClient(handler);

        var exception = await Assert.ThrowsAsync<TenantAdministrationClientException>(() => client.ChangeStatusAsync(
            Principal(),
            Guid.Parse("aaaaaaaa-1111-4111-8111-111111111111"),
            TenantLifecycleStatus.Disabled,
            4));

        Assert.Equal(HttpStatusCode.Conflict, exception.StatusCode);
        Assert.Contains("\"status\":\"Disabled\"", handler.RequestBody);
        Assert.Contains("\"expectedVersion\":4", handler.RequestBody);
    }

    [Fact]
    public async Task LoadsDescendingTenantHistoryWithCursor()
    {
        var tenantId = Guid.NewGuid();
        var handler = new RecordingHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(
                $"[{{\"transitionId\":\"{Guid.NewGuid()}\",\"tenantId\":\"{tenantId}\",\"previousStatus\":\"Active\",\"currentStatus\":\"Suspended\",\"tenantVersion\":2,\"changedAtUtc\":\"2026-01-01T00:00:00Z\",\"changedBySubject\":\"admin\",\"correlationId\":\"corr\"}}]",
                Encoding.UTF8,
                "application/json")
        });
        var client = CreateClient(handler);

        var history = await client.GetStatusHistoryAsync(Principal(), tenantId, 25, 7);

        Assert.Single(history);
        Assert.Equal(TenantLifecycleStatus.Suspended, history[0].CurrentStatus);
        Assert.Equal($"/api/system/tenants/{tenantId:D}/status-history?limit=25&beforeVersion=7", handler.RequestPath);
    }

    private static TenantAdministrationClient CreateClient(RecordingHandler handler) =>
        new(
            new HttpClient(handler) { BaseAddress = new Uri("http://bidding.test") },
            Microsoft.Extensions.Options.Options.Create(new BiddingServiceOptions()),
            new StubAccountService(),
            new StubTokenIssuer(),
            Microsoft.Extensions.Logging.Abstractions.NullLogger<TenantAdministrationClient>.Instance);

    private static ClaimsPrincipal Principal() => new(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "system-subject"),
            new Claim(ClaimTypes.Role, SystemAdminRoles.SystemAdministrator),
            new Claim("permission", SystemAdminPermissions.TenantStatus)
        ],
        "Test"));

    private sealed class RecordingHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public string Authorization { get; private set; } = string.Empty;
        public string RequestBody { get; private set; } = string.Empty;
        public string RequestPath { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Authorization = request.Headers.Authorization?.ToString() ?? string.Empty;
            RequestPath = request.RequestUri?.PathAndQuery ?? string.Empty;
            RequestBody = request.Content is null
                ? string.Empty
                : await request.Content.ReadAsStringAsync(cancellationToken);
            return responder(request);
        }
    }

    private sealed class StubAccountService : ISystemAdminAccountService
    {
        public Task<SystemAdminUser?> FindActiveByEmailAsync(string email, CancellationToken cancellationToken = default) =>
            Task.FromResult<SystemAdminUser?>(User());

        public Task<SystemAdminUser?> FindActiveBySubjectIdAsync(
            string subjectId,
            CancellationToken cancellationToken = default) =>
            Task.FromResult<SystemAdminUser?>(User());

        public PasswordVerificationResult VerifyPassword(SystemAdminUser user, string password) =>
            PasswordVerificationResult.Success;

        private static SystemAdminUser User() => new()
        {
            SubjectId = "system-subject",
            Email = "admin@example.test",
            NormalizedEmail = "ADMIN@EXAMPLE.TEST",
            PasswordHash = "unused",
            Role = SystemAdminRoles.SystemAdministrator,
            IsActive = true
        };
    }

    private sealed class StubTokenIssuer : ISystemAdminTokenIssuer
    {
        public string Issue(SystemAdminUser user, string audience) => "test-token";
    }
}
