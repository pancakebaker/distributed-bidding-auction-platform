using bidding_service.Options;
using Microsoft.Extensions.Options;

namespace bidding_service.Tests;

public sealed class ClientAssertionRolloutPolicyTests
{
    [Fact]
    public void DevelopmentMayDisableAdmissionWithoutOverride()
    {
        var result = Validate(isProduction: false, enabled: false, bypass: false);

        Assert.True(result.Succeeded);
    }

    [Fact]
    public void ProductionRejectsDisabledAdmissionWithoutOverride()
    {
        var result = Validate(isProduction: true, enabled: false, bypass: false);

        Assert.False(result.Succeeded);
        Assert.Contains("must be enabled", result.FailureMessage);
    }

    [Fact]
    public void ProductionAllowsExplicitTemporaryOverride()
    {
        var result = Validate(isProduction: true, enabled: false, bypass: true, reason: "controlled migration");

        Assert.True(result.Succeeded);
    }

    [Fact]
    public void ProductionRejectsTemporaryOverrideWithoutReason()
    {
        var result = Validate(isProduction: true, enabled: false, bypass: true);

        Assert.False(result.Succeeded);
        Assert.Contains("Reason", result.FailureMessage);
    }

    [Fact]
    public void ProductionRejectsMultilineTemporaryOverrideReason()
    {
        var result = Validate(isProduction: true, enabled: false, bypass: true, reason: "incident\nfollow-up");

        Assert.False(result.Succeeded);
    }

    [Fact]
    public void ProductionAllowsEnabledAdmission()
    {
        var result = Validate(isProduction: true, enabled: true, bypass: false);

        Assert.True(result.Succeeded);
    }

    private static ValidateOptionsResult Validate(bool isProduction, bool enabled, bool bypass, string? reason = null) =>
        new ClientAssertionAdmissionOptionsValidator(isProduction).Validate(
            Microsoft.Extensions.Options.Options.DefaultName,
            new ClientAssertionAdmissionOptions
            {
                Enabled = enabled,
                AllowInsecureProductionDisable = bypass,
                InsecureProductionDisableReason = reason
            });
}
