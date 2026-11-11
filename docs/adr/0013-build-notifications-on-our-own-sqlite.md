# Build Notifications on our own SQLite, not a hosted provider

Notifications are rows in a `notifications` table in `data.db` (ADR 0006), written by Cadence's own code. We don't use a hosted notification provider such as Knock, Novu, Courier or MagicBell. At our volume (under 10k Notifications a month) every serious provider is free, so price didn't decide this. What decided it: Notification content (names and quotes from Comments and Questions) stays inside Cadence, a Notification is written in the same transaction as the event that causes it, and a dev-only session doesn't have to secure a vendor's feed token.

## Considered Options

- **Novu Cloud.** The strongest vendor: React inbox, WebSocket push, and email later without extra billable units. Rejected because it sends user content to a third party for a live push we decided we don't need.
- **Knock, MagicBell.** Similar features at roughly 8× Novu's price beyond the free tier.
- **Self-hosted Novu.** Needs MongoDB, Redis, S3 and several services next to one SQLite file.

## Consequences

- **No live push.** The unread count refreshes on navigation and actions, and polls every ~60s and on window focus.
- **A failure creating a Notification rolls back the event that caused it.** The Notification shares the triggering write's transaction, so a bug in the Notification code blocks the Comment, Enrollment, rating or refund decision rather than failing silently.
- **Email is ours to build.** When email arrives we'll need a provider, templates, a queue and unsubscribe handling. Every Notification is created through one server entry point, so email, or a move to a provider, gets added in one place.
- **Moving to a vendor later** would mean migrating Notification history and replacing the bell and feed.
