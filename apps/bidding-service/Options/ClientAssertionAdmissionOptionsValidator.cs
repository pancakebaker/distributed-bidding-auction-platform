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
    public ValidateOptionsResult Validate(string? name, ClientAssertionAdmissionOptions options) =>
        isProduction && !options.Enabled && !options.AllowInsecureProductionDisable
            ? ValidateOptionsResult.Fail(
                "Client assertion admission must be enabled in Production. "
                + "Set ClientAssertionAdmission:AllowInsecureProductionDisable=true only for a temporary migration override.")
            : ValidateOptionsResult.Success;
}
