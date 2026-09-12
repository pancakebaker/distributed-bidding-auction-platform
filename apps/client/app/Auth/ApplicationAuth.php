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

    public const PERMISSION_AUCTION_BID = 'auction.bid';

    public const PERMISSION_AUCTION_BUY = 'auction.buy';

    public const PERMISSION_AUCTION_MANAGE = 'auction.manage';
}
