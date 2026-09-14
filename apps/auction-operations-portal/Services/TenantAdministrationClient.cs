// <copyright file="TenantAdministrationClient.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using AuctionOperationsPortal.Auth;
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Services;

/// <summary>Names of the authoritative tenant runtime states.</summary>
public enum TenantLifecycleStatus
{
    /// <summary>Normal tenant access.</summary>
    Active,
    /// <summary>Read-only tenant access.</summary>
    Suspended,
    /// <summary>No tenant-facing access.</summary>
    Disabled
}

/// <summary>Authoritative tenant lifecycle state returned by Bidding.</summary>
public sealed record TenantLifecycleState(
    Guid TenantId,
    string Name,
    TenantLifecycleStatus Status,
    long Version,
    DateTimeOffset UpdatedAtUtc);

/// <summary>Server-side client for the Bidding SystemAdministrator tenant API.</summary>
public interface ITenantAdministrationClient
{
    /// <summary>Loads the authoritative tenant lifecycle list.</summary>
    Task<IReadOnlyList<TenantLifecycleState>> GetTenantsAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken = default);

    /// <summary>Requests one status transition using the displayed expected version.</summary>
    Task<TenantLifecycleState> ChangeStatusAsync(
        ClaimsPrincipal principal,
        Guid tenantId,
        TenantLifecycleStatus status,
        long expectedVersion,
        CancellationToken cancellationToken = default);
}

/// <summary>Maps safe HTTP outcomes from the Bidding lifecycle API.</summary>
public sealed class TenantAdministrationClient(
    HttpClient httpClient,
    IOptions<BiddingServiceOptions> options,
    ISystemAdminAccountService accounts,
    ISystemAdminTokenIssuer tokenIssuer,
    ILogger<TenantAdministrationClient> logger) : ITenantAdministrationClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>Loads tenants from the authoritative Bidding API.</summary>
    public async Task<IReadOnlyList<TenantLifecycleState>> GetTenantsAsync(
        ClaimsPrincipal principal,
        CancellationToken cancellationToken = default)
    {
        using var response = await SendAsync(principal, HttpMethod.Get, options.Value.TenantEndpoint, cancellationToken);
        await EnsureSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<List<TenantLifecycleState>>(JsonOptions, cancellationToken)
            ?? [];
    }

    /// <summary>Changes one tenant status through the authoritative Bidding API.</summary>
    public async Task<TenantLifecycleState> ChangeStatusAsync(
        ClaimsPrincipal principal,
        Guid tenantId,
        TenantLifecycleStatus status,
        long expectedVersion,
        CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Patch,
            $"{options.Value.TenantEndpoint}/{tenantId:D}/status")
        {
            Content = JsonContent.Create(
                new { status = status.ToString(), expectedVersion },
                options: JsonOptions)
        };
        using var response = await SendAsync(principal, request, cancellationToken);
        await EnsureSuccessAsync(response);
        return await response.Content.ReadFromJsonAsync<TenantLifecycleState>(JsonOptions, cancellationToken)
            ?? throw new TenantAdministrationClientException(HttpStatusCode.BadGateway);
    }

    private async Task<HttpResponseMessage> SendAsync(
        ClaimsPrincipal principal,
        HttpMethod method,
        string path,
        CancellationToken cancellationToken)
    {
        return await SendAsync(
            principal,
            new HttpRequestMessage(method, path),
            cancellationToken);
    }

    private async Task<HttpResponseMessage> SendAsync(
        ClaimsPrincipal principal,
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var subjectId = principal.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!principal.IsInRole(SystemAdminRoles.SystemAdministrator)
            || !principal.HasClaim("permission", SystemAdminPermissions.TenantStatus)
            || string.IsNullOrWhiteSpace(subjectId))
        {
            request.Dispose();
            throw new TenantAdministrationClientException(HttpStatusCode.Forbidden);
        }

        var user = await accounts.FindActiveBySubjectIdAsync(subjectId, cancellationToken)
            ?? throw new TenantAdministrationClientException(HttpStatusCode.Unauthorized);
        var token = tokenIssuer.Issue(user, "bidding-service-admin");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        try
        {
            return await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Bidding tenant administration API was unavailable.");
            request.Dispose();
            throw new TenantAdministrationClientException(HttpStatusCode.ServiceUnavailable, exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Bidding tenant administration API timed out.");
            request.Dispose();
            throw new TenantAdministrationClientException(HttpStatusCode.ServiceUnavailable, exception);
        }
    }

    private static Task EnsureSuccessAsync(HttpResponseMessage response)
    {
        if (response.IsSuccessStatusCode)
            return Task.CompletedTask;

        return Task.FromException(new TenantAdministrationClientException(response.StatusCode));
    }
}

/// <summary>Safe HTTP failure from the tenant administration client.</summary>
public sealed class TenantAdministrationClientException(
    HttpStatusCode statusCode,
    Exception? innerException = null)
    : Exception("The tenant administration request failed.", innerException)
{
    /// <summary>Gets the safe status classification.</summary>
    public HttpStatusCode StatusCode { get; } = statusCode;
}
