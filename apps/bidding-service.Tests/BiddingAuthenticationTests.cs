using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;

namespace bidding_service.Tests;

public sealed class BiddingAuthenticationTests : IClassFixture<AuctionApiFactory>
{
    private readonly HttpClient client;

    public BiddingAuthenticationTests(AuctionApiFactory factory)
    {
        client = factory.CreateClient();
    }

    [Fact]
    public async Task ValidLaravelStyleTokenExposesAuthenticatedSubject()
    {
        var token = JwtTestKeys.CreateToken("stable-subject");
        Assert.True(JwtTestKeys.Verify(token));
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.True(response.StatusCode == HttpStatusCode.OK, $"{response.StatusCode}: {string.Join(";", response.Headers.WwwAuthenticate)}");
        var body = await response.Content.ReadAsStringAsync();
        Assert.Contains("stable-subject", body, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("wrong-issuer", "dbap-bidding-service")]
    [InlineData("dbap-laravel", "wrong-audience")]
    public async Task InvalidIssuerOrAudienceIsRejected(string issuer, string audience)
    {
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", JwtTestKeys.CreateToken(issuer: issuer, audience: audience));

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ExpiredTokenIsRejected()
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            JwtTestKeys.CreateToken(expiresAt: DateTimeOffset.UtcNow.AddMinutes(-5)));

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task MissingTokenIsRejectedByPolicy()
    {
        client.DefaultRequestHeaders.Authorization = null;

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ValidAuthenticationWithoutPermissionIsForbidden()
    {
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            JwtTestKeys.CreateToken(permissions: ["auction.buy"]));

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task InvalidSignatureIsRejected()
    {
        using var wrongSigningKey = RSA.Create(2048);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            JwtTestKeys.CreateToken(signingKey: wrongSigningKey));

        var response = await client.GetAsync("/testing/authenticated-sub");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }
}
