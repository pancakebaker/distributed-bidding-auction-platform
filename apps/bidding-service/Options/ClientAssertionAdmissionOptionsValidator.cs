// <copyright file="ClientAssertionAdmissionOptionsValidator.cs" company="Distributed Bidding Auction Platform">
// Copyright (c) Distributed Bidding Auction Platform. Licensed under the MIT license.
// </copyright>
using Microsoft.Extensions.Options;

namespace bidding_service.Options;

/// <summary>Enforces the production rollout policy for client assertion admission.</summary>
public sealed class ClientAssertionAdmissionOptionsValidator(bool isProduction)
    : IValidateOptions<ClientAssertionAdmissionOptions>
{
    /// <inheritdoc />
    public ValidateOptionsResult Validate(string? name, ClientAssertionAdmissionOptions options)
    {
        if (!isProduction || options.Enabled)
        {
            return ValidateOptionsResult.Success;
        }

        if (!options.AllowInsecureProductionDisable)
        {
            return ValidateOptionsResult.Fail(
                "Client assertion admission must be enabled in Production. "
                + "Set ClientAssertionAdmission:AllowInsecureProductionDisable=true only for a temporary migration override.");
        }

        var reason = options.InsecureProductionDisableReason?.Trim();
        return string.IsNullOrWhiteSpace(reason) || reason.Length > 256 || reason.Contains('\r') || reason.Contains('\n')
            ? ValidateOptionsResult.Fail(
                "ClientAssertionAdmission:InsecureProductionDisableReason must be a single-line value of 1 to 256 characters when the production bypass is enabled.")
            : ValidateOptionsResult.Success;
    }
}
