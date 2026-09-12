// <copyright file="LiveFeedAdminHandoffClient.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using System.Net.Http.Headers;
using System.Text.Json;
using AuctionOperationsPortal.Options;
using Microsoft.Extensions.Options;

namespace AuctionOperationsPortal.Auth;

/// <summary>Creates Live Feed browser handoffs without exposing service tokens.</summary>
public interface ILiveFeedAdminHandoffClient
{
    /// <summary>Exchanges a server-issued JWT for an opaque, single-use browser code.</summary>
    Task<string> CreateHandoffAsync(string systemAdminToken, CancellationToken cancellationToken = default);
}

/// <summary>HTTP client for the Live Feed system-admin exchange.</summary>
public sealed class LiveFeedAdminHandoffClient(
    HttpClient httpClient,
    IOptions<LiveFeedAdminOptions> options,
    ILogger<LiveFeedAdminHandoffClient> logger) : ILiveFeedAdminHandoffClient
{
    /// <inheritdoc />
    public async Task<string> CreateHandoffAsync(
        string systemAdminToken,
        CancellationToken cancellationToken = default)
    {
        using var request = new HttpRequestMessage(
            HttpMethod.Post,
            options.Value.SystemTokenEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", systemAdminToken);
        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Live Feed system-admin handoff is unavailable.");
            throw new LiveFeedAdminHandoffException(exception);
        }
        catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(exception, "Live Feed system-admin handoff timed out.");
            throw new LiveFeedAdminHandoffException(exception);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Live Feed system-admin handoff failed with status {StatusCode}.",
                    (int)response.StatusCode);
                throw new LiveFeedAdminHandoffException();
            }

            try
            {
                await using var body = await response.Content.ReadAsStreamAsync(cancellationToken);
                using var document = await JsonDocument.ParseAsync(body, cancellationToken: cancellationToken);
                var code = document.RootElement.GetProperty("handoffCode").GetString();
                if (string.IsNullOrWhiteSpace(code) || code.Length > 256)
                    throw new InvalidDataException("The Live Feed handoff response was invalid.");
                return code;
            }
            catch (Exception exception) when (exception is JsonException or KeyNotFoundException or InvalidDataException)
            {
                logger.LogWarning("Live Feed returned an invalid system-admin handoff response.");
                throw new LiveFeedAdminHandoffException(exception);
            }
        }
    }
}

/// <summary>Safe failure raised when Live Feed cannot establish an admin session.</summary>
public sealed class LiveFeedAdminHandoffException(Exception? innerException = null)
    : Exception("Live Feed admin access is temporarily unavailable.", innerException);
