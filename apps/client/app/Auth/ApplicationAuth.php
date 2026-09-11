<?php

namespace App\Auth;

/**
 * Defines application-specific authentication claim and permission identifiers.
 */
final class ApplicationAuth
{
    public const CLAIM_PERMISSIONS = 'permissions';

    public const CLAIM_ROLE = 'role';

    public const ROLE_ADMIN = 'admin';

    public const PERMISSION_AUCTION_OPERATIONS = 'access-auction-operations';

    public const PERMISSION_LIVE_FEED_ADMIN = 'access-live-feed-admin';
}
