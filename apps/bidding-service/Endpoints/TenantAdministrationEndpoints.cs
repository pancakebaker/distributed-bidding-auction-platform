// <copyright file="TenantAdministrationEndpoints.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using bidding_service.Contracts;
using bidding_service.Domain;
using bidding_service.Services;

namespace bidding_service.Endpoints;

/// <summary>Request for an optimistic-concurrency-protected tenant status change.</summary>
public sealed record ChangeTenantStatusRequest(string? Status, long ExpectedVersion);

/// <summary>Maps system-administrator tenant lifecycle endpoints.</summary>
public static class TenantAdministrationEndpoints
{
    /// <summary>Registers the system-administrator tenant status endpoint.</summary>
    public static void MapTenantAdministrationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/system/tenants/{tenantId:guid}/status", async (
                Guid tenantId,
                ChangeTenantStatusRequest request,
                ITenantStatusAdministrationService service,
                HttpContext context,
                CancellationToken cancellationToken) =>
            {
                if (request.Status is null
                    || !Enum.TryParse<TenantStatus>(request.Status, ignoreCase: false, out var status)
                    || request.ExpectedVersion < 1)
                {
                    return Results.BadRequest(new ApiErrorResponse(
                        "invalid_tenant_status_request",
                        "Status and a positive expectedVersion are required."));
                }

                var correlationId = context.Request.Headers["X-Correlation-ID"].FirstOrDefault()?.Trim();
                if (string.IsNullOrWhiteSpace(correlationId)
                    || correlationId.Length > 128
                    || correlationId.Any(char.IsControl))
                    correlationId = Guid.NewGuid().ToString("N");

                TenantStatusTransitionResult? result;
                try
                {
                    result = await service.ChangeStatusAsync(
                        tenantId,
                        status,
                        request.ExpectedVersion,
                        correlationId,
                        cancellationToken);
                }
                catch (TenantStatusConcurrencyException)
                {
                    return Results.Conflict(new ApiErrorResponse(
                        "tenant_status_conflict",
                        "Tenant status changed concurrently. Refresh and retry."));
                }

                if (result is null)
                    return Results.NotFound(new ApiErrorResponse("tenant_not_found", "Tenant not found."));

                return Results.Ok(new TenantStatusResponse(
                    result.Tenant.Id,
                    result.Tenant.Status,
                    result.Tenant.Version,
                    result.Tenant.UpdatedAtUtc));
            })
            .RequireAuthorization("SystemAdminTenantStatus")
            .WithTags("System administration")
            .ExcludeFromDescription();
    }
}

/// <summary>Current authoritative tenant lifecycle state.</summary>
public sealed record TenantStatusResponse(
    Guid TenantId,
    TenantStatus Status,
    long Version,
    DateTimeOffset UpdatedAtUtc);
