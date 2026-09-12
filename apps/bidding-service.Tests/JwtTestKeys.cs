using System.Security.Cryptography;

namespace bidding_service.Tests;

internal static class JwtTestKeys
{
    private static readonly string[] DefaultPermissions = ["auction.bid"];
    private static readonly RSA SigningKey = RSA.Create(2048);
    private static readonly string PublicKeyPath = WritePublicKey();

    public static string Path => PublicKeyPath;

    public static bool Verify(string token)
    {
        var segments = token.Split('.');
        using var rsa = RSA.Create();
        rsa.ImportFromPem(File.ReadAllText(PublicKeyPath));
        return rsa.VerifyData(
            System.Text.Encoding.UTF8.GetBytes($"{segments[0]}.{segments[1]}"),
            Base64UrlDecode(segments[2]),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
    }

    public static string CreateToken(
        string subject = "test-subject",
        string issuer = "dbap-laravel",
        string audience = "dbap-bidding-service",
        DateTimeOffset? expiresAt = null,
        string[]? permissions = null,
        RSA? signingKey = null,
        string keyId = "bidding-service-v1")
    {
        var now = DateTimeOffset.UtcNow;
        var header = Encode(new { alg = "RS256", typ = "JWT", kid = keyId });
        var payload = Encode(new
        {
            iss = issuer,
            aud = audience,
            sub = subject,
            iat = now.ToUnixTimeSeconds(),
            exp = (expiresAt ?? now.AddMinutes(5)).ToUnixTimeSeconds(),
            jti = Guid.NewGuid().ToString(),
            permissions = permissions ?? DefaultPermissions
        });
        var input = $"{header}.{payload}";
        var key = signingKey ?? SigningKey;
        var signature = key.SignData(
            System.Text.Encoding.UTF8.GetBytes(input),
            HashAlgorithmName.SHA256,
            RSASignaturePadding.Pkcs1);
        return $"{input}.{Base64Url(signature)}";
    }

    private static string WritePublicKey()
    {
        var path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"dbap-auth-{Guid.NewGuid():N}.pem");
        File.WriteAllText(path, SigningKey.ExportSubjectPublicKeyInfoPem());
        return path;
    }

    private static string Encode(object value) =>
        Base64Url(System.Text.Encoding.UTF8.GetBytes(System.Text.Json.JsonSerializer.Serialize(value)));

    private static string Base64Url(byte[] value) =>
        Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string value) =>
        Convert.FromBase64String(
            value.Replace('-', '+').Replace('_', '/')
            + new string('=', (4 - (value.Length % 4)) % 4));
}
