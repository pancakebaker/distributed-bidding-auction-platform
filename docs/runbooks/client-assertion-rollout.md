# Client assertion rollout runbook

This runbook covers controlled activation of server-to-server client
assertions after MT5.3. The Bidding Service owns the `ClientApplication` and
`ClientCredential` records. Laravel owns the matching private key and issues a
fresh assertion for each outbound Bidding Service request.

The default remains compatibility mode:

| Laravel issuance | Bidding admission | Result |
| --- | --- | --- |
| off | off | legacy behavior |
| on | off | assertions are sent but not required yet |
| on | on | secured target mode |
| off | on | tenant-facing requests fail with `401`; rollout is incomplete |

The admission flag is a migration control, not a permanent security bypass.
After rollout is validated, the deployment should keep both sides enabled and
the flag should be removed or made mandatory in a later hardening phase.

## Bootstrap a registered application

Generate the keypair on the Laravel/client host or in a deployment secret
manager. The private key must remain there. The Bidding Service receives only
the public SubjectPublicKeyInfo PEM.

For a local OpenSSL installation, a 3072-bit RSA pair can be generated outside
the repository:

```text
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out private-key.pem
openssl pkey -in private-key.pem -pubout -out public-key.pem
```

Provision the public key through the internal operator tool. It resolves the
application by authoritative `client_id`, applies all MT5.2 validation and
database uniqueness constraints, and prints only non-secret metadata:

```powershell
.\scripts\provision-client-assertion.ps1 `
  -ClientId local-laravel-client `
  -KeyId laravel-2026-01 `
  -PublicKeyPath C:\secrets\dbap\public-key.pem
```

The tool is not an HTTP endpoint, has no browser/UI surface, and never accepts
or reads the private key. It can also be invoked directly:

```text
$env:ASPNETCORE_ENVIRONMENT = 'Development'
Set-Location apps/bidding-service
dotnet run --project bidding-service.csproj -- provision --client-id local-laravel-client --key-id laravel-2026-01 --public-key-path C:\secrets\dbap\public-key.pem
```

Provisioning is allowed for an `Active` or `Disabled` application so a
deployment can prepare credentials. It is rejected for a `Revoked`
application. Tenant status is not part of this provisioning decision.

## Configure Laravel

Mount the private key as a server-side file and set the following values in
`apps/client/.env` or deployment secret configuration:

```text
BIDDING_SERVICE_CLIENT_ASSERTION_ENABLED=true
BIDDING_SERVICE_CLIENT_ID=local-laravel-client
BIDDING_SERVICE_CLIENT_KEY_ID=laravel-2026-01
BIDDING_SERVICE_CLIENT_PRIVATE_KEY_PATH=/run/secrets/dbap-client-private.pem
BIDDING_SERVICE_CLIENT_ASSERTION_TTL_SECONDS=30
```

The path must point to an RSA private key of at least 2048 bits. Laravel emits
RS256 with `iss = ClientId`, `kid = KeyId`, the server-configured installation
`tenant_id`, a fresh UUID JTI, `iat`/`nbf`, the `dbap-bidding-service`
audience, and a 30-second expiry. The assertion is sent as
`X-Client-Assertion` alongside the existing human `Authorization` token; it is
never sent to the browser and does not change human JWT claims or permissions.

Run `php artisan config:cache` as part of deployment validation. The path is
cached as configuration; PEM contents are loaded server-side by the issuer and
are not written to the Laravel database, responses, or logs. Restart/reload
Laravel workers after changing the mounted key or `KeyId`.

## Activate Bidding Service admission

Deploy the registered public credential and Laravel configuration first. Keep
the Bidding Service default unchanged until a smoke test with a fresh assertion
has passed. Then set the deployment-only override:

```text
ClientAssertionAdmission__Enabled=true
```

The Bidding Service validates the assertion, consumes its JTI once through
Redis, binds the validated application tenant to the bearer/read-token tenant,
and then runs the existing permissions and resource-ownership checks. Missing,
invalid, or replayed proof is `401`; an identity tenant mismatch is `403`; a
replay-store outage is `503`. `/health`, system-admin surfaces, workers, and
Live Feed are outside this boundary.

## Smoke test and rollback

Use a same-tenant read request and a safe same-tenant command:

1. Fresh assertion + valid read token succeeds.
2. Reusing that assertion returns `401`.
3. A fresh assertion succeeds again.
4. A client assertion paired with another tenant's bearer/read token returns
   `403` without executing the action.
5. Existing human permissions remain required.

If the smoke test fails, first disable the Bidding Service admission override
and keep Laravel issuance enabled only if it is useful for diagnostics. Do not
revoke the active credential until a replacement credential is provisioned and
the new private key/`KeyId` pair has been deployed. To revoke an old credential
after overlap is confirmed:

```powershell
.\scripts\revoke-client-assertion.ps1 -KeyId laravel-2025-12
```

Revocation preserves the credential row and public-key audit history. A lost or
suspected private key is handled by provisioning a replacement, switching
Laravel to the new `KeyId` and private key, reloading Laravel, and then
revoking the old credential. Never upload a private key to the Bidding Service.

## Troubleshooting and ownership

- `401` from an enabled route: verify the Laravel feature flag, `ClientId`,
  `KeyId`, private-key path, assertion audience, and that the credential is
  active and currently valid.
- `403`: compare the installation tenant from Laravel with the bearer/read
  token tenant. Do not fix this by accepting a tenant from browser input.
- `503`: inspect Redis availability and the Bidding Service replay-protection
  logs; admission fails closed when Redis is unavailable.
- `404` for a cross-tenant resource is expected resource isolation behavior.

Client applications and credentials are provisioned by the Bidding Service
operator boundary. Laravel only holds the private key and issues proof.
There is no public provisioning API, Operations Portal credential UI, WordPress
implementation, or later rollout/default-on activation in this phase.
