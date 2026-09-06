# Screenshot Capture Guide

This guide documents how the current portfolio screenshots were captured and how to refresh them without adding screenshot-only state to the application code.

## General Setup

From the repository root:

```powershell
scripts\start-infrastructure.ps1
scripts\reset-demo.ps1
scripts\start-demo.ps1
```

Open `http://localhost:8000/auctions`. Keep browser devtools closed and avoid local debugging overlays. A 1440x900 browser viewport works well for the primary screenshots.

## `docs/assets/auction-live.png` - captured

Recommended viewport: 1440x900.

1. Run `scripts\reset-demo.ps1`.
2. Start the full demo stack with `scripts\start-demo.ps1`.
3. Open the MacBook Pro auction.
4. Select Alice or Bob in the bidder selector.
5. Confirm the page shows:
   - Status `Open`
   - Current bid `1900`
   - Highest bidder `Bob`
   - Bid history including Alice and Bob
   - Live connected indicator
6. Capture the auction detail page without browser devtools.

## `docs/assets/auction-two-clients.png` - captured

Recommended layout: two browser windows side by side on a wide desktop display.

1. Run `scripts\reset-demo.ps1`.
2. Open the MacBook Pro auction in both windows.
3. Select Alice in the left window and Bob in the right window.
4. Place a valid higher bid from one browser if you want to show motion before capture.
5. Confirm both windows show the same current bid and auction version.
6. Capture both windows with the live connection indicator visible.

## `docs/assets/auction-closed.png` - captured

Preferred real lifecycle path:

1. Run `scripts\reset-demo.ps1`.
2. Start the full demo stack.
3. Open the Short Demo Auction.
4. Place a valid Bob bid.
5. Wait for the scheduler to close the auction.
6. Capture the Closed state with final price, winner, and disabled bid controls.

Static deterministic alternative for faster screenshot preparation:

```powershell
scripts\reset-demo.ps1 -ClosedScreenshot
```

Then open the Short Demo Auction and capture the backend-seeded Closed state. This still uses real REST data, not fake frontend-only state.

## `docs/assets/auction-demo.gif` - optional future asset

Storyboard target: 10-20 seconds.

| Time | Shot |
| --- | --- |
| 0-2 sec | Two clients open on the same auction. |
| 2-4 sec | Alice places a higher bid. |
| 4-6 sec | Both clients update through `bid:accepted`. |
| 6-8 sec | Bob places a higher bid. |
| 8-10 sec | Both clients update again and bid history advances. |
| 10-13 sec | Short auction countdown reaches expiry. |
| 13-16 sec | `Auction Closed` and `Winner: Bob` appear; bid controls are disabled. |

Keep the GIF focused on the UI. Do not show terminal logs unless making a separate technical walkthrough.

## Responsive Checks

Before capturing final assets, quickly inspect:

- 1440x900 desktop
- 1366x768 laptop
- 390x844 mobile

Fix only obvious presentation issues such as overflow, clipped bid controls, unreadable bid history, or awkward wrapping.

