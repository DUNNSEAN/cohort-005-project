# In-app notification providers vs. a SQLite `notifications` table

Research note for **Cadence**. Written 2026-11-11. All vendor pages were read on **2026-11-11** unless stated otherwise.

**Question.** Which hosted in-app notification providers fit Cadence, and how do they compare to building a `notifications` table in our own SQLite database?

**Scope.** In-app only: a bell with an unread badge and a feed, for Students and Instructors. Example triggers are a new Comment on a lesson, and a new Question for an Instructor. Adding email later is a factor. This note compares options and does **not** recommend one.

**Scale assumption ("cohort scale").** Roughly 300–3,000 monthly active users and **10,000–50,000 in-app notifications per month**. Where a single cost figure is shown, it is for a midpoint of **~20,000 in-app notifications per month**. Adding email at the same volume roughly doubles the count on per-message plans (Knock, Courier, MagicBell, SuprSend). It does not double it on Novu, which bills per workflow run (see the Novu section).

**Method.** Primary sources only: official docs, official pricing pages and official GitHub repos. Claims cite their URL inline. "Unverified" means no primary source confirmed it.

---

## 0. What exists in this repo today (baseline for the build option)

Read from this repo, not from the web:

- **Stack.** `react-router` / `@react-router/node` / `@react-router/serve` are all at **8.3.0** in `package.json`. The brief said "React Router v7", but the repo is on v8. The data APIs used below (loaders, actions, `useFetcher`, resource routes) are the same. Other dependencies are `drizzle-orm ^0.45.2` and `better-sqlite3 ^12.8.0`. There is no email library, and no websocket or realtime library.
- **Database.** `app/db/index.ts` opens one lazily created `better-sqlite3` connection to `data.db` with `journal_mode = WAL` and `foreign_keys = ON`. It exposes `db` (Drizzle) through a side-effect-free Proxy, so the module stays out of client bundles. Calls are synchronous (`.get()`, `.all()`, `.returning().get()`). Migrations live in `drizzle/` (0000–0006) via `drizzle-kit`, and the `database-migrations` skill covers schema changes.
- **Schema conventions** (`app/db/schema.ts`):
  - Integer autoincrement PKs.
  - ISO-string `text` timestamps with `$defaultFn(() => new Date().toISOString())`.
  - Nullable timestamp columns as state flags: `comments.editedAt` and `comments.deletedAt` for soft delete.
  - TS enums stored as `text` (`UserRole` = student / instructor / admin).
  - Explicit `index()` declarations.
- **Domain events that would trigger notifications.**
  - A **Comment** is a row in `comments` (`lessonId`, `userId`, nullable `parentId`, one level of replies).
  - A **Question** is not its own table. `app/routes/instructor.questions.tsx` derives "unanswered questions" from top-level comments without a staff reply. A "new Question for an Instructor" event is therefore "a student created a top-level comment on a lesson in a course this instructor owns".
  - `createComment` is duplicated in `app/routes/courses.$slug.lessons.$lessonId.tsx` (~line 431) and `app/routes/instructor.questions.tsx` (~line 153). A notification hook would need adding in both places, or both would first need moving into one shared module.
- **How server mutations are written.** Route `action`s:
  - branch on a hidden `intent` field (`create-comment`, `edit-comment`, `delete-comment`, `reply`);
  - validate with zod (`parseFormData`, `parseJsonBody` in `app/lib/validation.ts`);
  - check access with `requireStaff` / `requireInstructorOrAdmin` (`app/lib/access.server.ts`);
  - get called from the client via `useFetcher` (used in about 15 routes and components, including `app/components/comment-thread.tsx`).

  JSON resource routes exist already, for example `app/routes/api.video-tracking.ts` (an action with no default export).
- **Realtime / polling.** There is **no** realtime channel. A grep for `EventSource`, `WebSocket`, `text/event-stream` and `useRevalidator` finds nothing. The only `setInterval` is video watch tracking in `app/components/youtube-player.tsx`. There is no `shouldRevalidate`. Data refreshes only on navigation and on the automatic revalidation after actions.
- **Where a bell would go.** `app/routes/layout.app.tsx` is the layout loader for every signed-in page. It already computes per-user data (`currentUser`, `recentCourses`, `isTeamAdmin`) and passes it to `<Sidebar>` (`app/components/sidebar.tsx`, a static `navItems` array filtered by role). An unread count could be added to that loader. Because React Router revalidates loaders after every action, the badge would refresh on any mutation the user makes, but not when *another* user's action creates a notification.
- **Auth.** `app/lib/session.ts` is a dev-only cookie session (`userId` set by the DevUI user switcher). There is no real login. Every hosted provider below needs a **server-signed per-user token or HMAC** to secure its client feed. Generating one is easy, but it ties a user's feed security to Cadence's session security.

---

## 1. Knock

1. **React component.** `@knocklabs/react`, with `KnockFeedProvider`, `NotificationIconButton` (the bell), `NotificationFeedPopover`, `NotificationFeed` and `NotificationCell`. Source: [Knock React feed docs](https://docs.knock.app/in-app-ui/react/feed). The JS monorepo is MIT-licensed ([knocklabs/javascript](https://github.com/knocklabs/javascript)).
2. **Pricing** (as read 2026-11-11, [knock.app/pricing](https://knock.app/pricing)):

   | Plan | Price | Includes | Overage |
   |---|---|---|---|
   | Free | $0 | **10,000 messages/month** | "Messages are not hard-capped"; Knock contacts you to add billing |
   | Starter | **$250/month** | 50,000 messages | $0.005/message |
   | Enterprise | Custom | — | — |

   A "message" is one message to one user on one channel, so in-app plus email counts as two.
   - **At ~20k/month in-app:** over the free cap, so Starter at **$250/month**.
   - **At ≤10k:** $0.
3. **Self-hosting.** Not offered. The pricing page only describes the hosted service ([pricing](https://knock.app/pricing)). No primary source documents an on-prem edition (**unverified** whether one exists for enterprise).
4. **Realtime.** WebSocket. `FeedClient.listenForUpdates()` connects to the realtime socket ([FeedClient reference](https://docs.knock.app/in-app-ui/javascript/sdk/feed-client)). The socket sends a `new-message` event with badge-count metadata, which may be throttled ([socket behavior](https://docs.knock.app/in-app-ui/feeds/socket-behavior)).
5. **State.**
   - Engagement statuses are `seen`, `read`, `link_clicked`, `interacted` and `archived`, each with a `*_at` timestamp ([message statuses](https://docs.knock.app/send-notifications/message-statuses)).
   - "Mark all as read" bulk-updates to read ([same page](https://docs.knock.app/send-notifications/message-statuses)).
   - The popover marks items as seen on open by default, and the badge can count unseen or unread ([React feed](https://docs.knock.app/in-app-ui/react/feed)).
6. **Email later.** Add an email channel step to the same workflow. The downstream provider (for example Postmark) is billed separately, and each email counts as another Knock message ([pricing](https://knock.app/pricing)).
7. **Node trigger.** `@knocklabs/node` (Apache-2.0) ([knock-node](https://github.com/knocklabs/knock-node)):
   `await knock.workflows.trigger("new-comment", { recipients: ["42"], data: { lessonId } })`
   - **Security note:** "By default, Knock feeds are accessible to anyone who has the feed ID". For production, enable enhanced security and pass a server-signed `userToken` ([React feed](https://docs.knock.app/in-app-ui/react/feed)).

## 2. Novu (Cloud and self-hosted)

1. **React component.** `@novu/react`, with `<Inbox />` and the sub-components Bell, Notifications, InboxContent and Preferences. `@novu/js` is the framework-agnostic client ([Inbox overview](https://docs.novu.co/platform/inbox/overview)).
2. **Pricing** (as read 2026-11-11, [novu.co/pricing](https://novu.co/pricing)):

   | Plan | Price | Includes | Overage |
   |---|---|---|---|
   | Free | $0 | **10,000 workflow runs/month**, ≤5 workflows, 3 team members, 24h activity retention | — |
   | Pro | **from $30/month** | 30,000+ runs | $1.20 per 1,000 runs |
   | Team | from $250/month | 250,000+ runs | $1.20 per 1,000 runs |
   | Enterprise | Custom | — | — |

   - **Billing unit:** one workflow run = one workflow executed for one subscriber ([billing docs](https://docs.novu.co/platform/account/billing)). An in-app step plus an email step in the *same* workflow is therefore one run. The billing page says runs are billed per subscriber resolved from the trigger. Whether multi-step runs are ever billed per step is **unverified**.
   - **Branding:** removing Novu branding from the Inbox needs a paid plan ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).
   - **What happens above the free limit:** the pricing FAQ answer did not render in the fetch (**unverified**).
   - **At ~20k/month:** Pro, **~$30/month**.
3. **Self-hosting.**
   - **License:** the core is **MIT**. The `/enterprise` folder is under a commercial license ([novuhq/novu](https://github.com/novuhq/novu)).
   - **Requirements:** the Community self-hosted edition runs API, Worker, WS and Dashboard services and needs **MongoDB, Redis (with AOF) and S3-compatible storage**. The single-VM minimum is 4 vCPU and 8 GB RAM ([self-hosting overview](https://docs.novu.co/community/self-hosting-novu/overview)).
   - **Missing in Community:** snooze, branding removal, email activity tracking and social login. Community is capped at 1 team member. The bell, inbox, preferences, digest and both GUI and code workflows are included ([self-hosted vs cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud)). An Enterprise self-hosted edition is sold separately ([pricing](https://novu.co/pricing)).
   - This is a large infrastructure footprint next to a single-SQLite-file app.
4. **Realtime.** WebSocket. Cloud uses PartySocket and self-hosted uses socket.io. Client events include `notifications.notification_received`, `notifications.unread_count_changed` and `notifications.unseen_count_changed` ([@novu/js](https://docs.novu.co/platform/sdks/javascript)).
5. **State.**
   - Per notification: `read`, `unread`, `seen`, `archive`, `unarchive`, `snooze`, `unsnooze` and `delete`.
   - Bulk: `readAll`, `seenAll`, `archiveAll`, `archiveAllRead` and `deleteAll` ([@novu/js](https://docs.novu.co/platform/sdks/javascript)).
6. **Email later.** Email is included on every plan, Free included ([pricing](https://novu.co/pricing)). You connect an email provider integration ([email integrations](https://docs.novu.co/platform/integrations/email)) and add an email step to the workflow.
7. **Node trigger.** `@novu/api` ([trigger docs](https://docs.novu.co/platform/workflow/trigger-workflow)):
   `await novu.trigger({ workflowId: "new-comment", to: [{ subscriberId: "42" }], payload: { lessonId } })`
   - **Security note:** in production, enable HMAC on the In-App provider and pass `subscriberHash = HMAC-SHA256(secretKey, subscriberId)` from the server. If HMAC is on and the hash is missing, "the Inbox will not load" ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production)).

## 3. Courier

1. **React component.** `@trycourier/courier-react` (v9, React 18+), with `CourierInbox`, `CourierInboxPopupMenu`, `CourierToast`, `CourierPreferences` and the `useCourier()` hook. It renders client-side only ([courier-react docs](https://www.courier.com/docs/sdk-libraries/courier-react-web)). **Deprecated:** `@trycourier/react-inbox`, `react-provider` and the `components` bundle ([Inbox overview](https://www.courier.com/docs/platform/inbox/inbox-overview)).
2. **Pricing** (as read 2026-11-11, [courier.com/pricing](https://www.courier.com/pricing)):

   | Plan | Price | Includes |
   |---|---|---|
   | Developer | Free | 10,000 sends/month |
   | Business | **$0.005 per send**, pay-as-you-go | — |
   | Enterprise | Custom | — |

   - **Gaps on the page:** it does not say whether the Inbox is in the free tier, or what happens above 10k on Developer (the FAQ answer did not render, **unverified**).
   - **How sends are counted:** Courier's own comparison guides say in-app counts as a normal send, and one Send API call to one recipient counts once across several channels ([Courier vs Knock guide](https://www.courier.com/guides/courier-vs-knock-notification-system)). Those are marketing guides, not the pricing page, so treat this as **partly unverified**.
   - **At ~20k/month:** roughly **$50–$100/month**, depending on whether the first 10k stay free on Business (**unverified**).
3. **Self-hosting.** Not offered. Only hosted plans are listed ([pricing](https://www.courier.com/pricing)).
4. **Realtime.** WebSocket, via `courierClient.inbox.socket.connect()` and `addMessageEventListener`. Events include `NewMessage`, `Read`, `MarkAllRead` and `Archive`. The socket does **not** push a numeric unread total, so the client re-fetches counts ([Courier JS SDK](https://www.courier.com/docs/sdk-libraries/courier-js-web)).
5. **State.**
   - Per message: `read`, `unread`, `open`, `click`, `archive` and `unarchive`.
   - Bulk: `readAll`, `archiveRead` and `archiveAll` ([Courier JS SDK](https://www.courier.com/docs/sdk-libraries/courier-js-web)).
   - There is no separate "seen" state. Courier's equivalent is "opened".
6. **Email later.** Courier is multi-channel by design. You add email routing in the same send or template; the email provider is configured and paid separately (**unverified** detail).
7. **Node trigger.** `@trycourier/courier` (Apache-2.0) ([courier-node](https://github.com/trycourier/courier-node)):
   `await courier.send.message({ message: { to: { user_id: "42" }, content: { title, body } } })`
   - **Security note:** the client authenticates with a JWT. Your backend mints it via `POST /auth/issue-token` with scopes `user_id:<id> inbox:read:messages inbox:write:events`. Omitting `expires_in` produces a token that never expires ([Courier auth](https://www.courier.com/docs/platform/inbox/authentication)).

## 4. MagicBell

1. **React component.** `@magicbell/react`, with subpath imports `@magicbell/react/context-provider`, `/inbox` and `/floating-inbox`. The default trigger is `InboxButton`, a bell ([MagicBell React](https://www.magicbell.com/docs/libraries/magicbell-react)).
2. **Pricing** (as read 2026-11-11, [magicbell.com/pricing](https://www.magicbell.com/pricing)):

   | Plan | Price | Includes | Overage |
   |---|---|---|---|
   | Builder | $0 | **1,000 deliveries/month**, 1 project | Builder rate not stated |
   | Startup | **$249/month** | 50,000 deliveries | $0.0025/delivery |
   | Enterprise | Custom | — | — |

   **At ~20k/month:** Startup, **$249/month**. This is the smallest free tier in the set.
3. **Self-hosting.** Not offered on the pricing page ([pricing](https://www.magicbell.com/pricing)).
4. **Realtime.** WebSocket, per MagicBell's Inbox product page ([inbox](https://www.magicbell.com/inbox)). The status page lists "In-App Delivery (via Ably)" ([status](https://status.magicbell.com/)). Protocol details are **unverified**.
5. **State.**
   - States are read, seen and archived, with `read_at` and `seen_at` timestamps ([notification primitive](https://www.magicbell.com/docs/primitive/notification)).
   - The React docs mention read/unread only ([MagicBell React](https://www.magicbell.com/docs/libraries/magicbell-react)).
   - Mark-all-read: **unverified**. It was not found on the fetched pages.
6. **Email later.** The docs navigation lists an Email channel with SES, Mailgun, SendGrid and SMTP providers ([docs](https://www.magicbell.com/docs)). A delivery to email presumably counts as another delivery (**unverified**).
7. **Node trigger.** `magicbell-js` ([Browser/Node client](https://www.magicbell.com/docs/libraries/magicbell-js)):
   `await client.broadcasts.createBroadcast({ title, content, recipients: [{ externalId: "42" }] })`
   - **Security note:** the Provider requires a User JWT signed HS256 with the project secret, carrying `user_email` and/or `user_external_id` ([user auth](https://www.magicbell.com/docs/api/authentication/user)).

## 5. Other candidates (brief)

- **SuprSend.**
  - **Pricing** (as read 2026-11-11, [suprsend.com/pricing](https://www.suprsend.com/pricing)): Free gives 10,000 notifications/month, and the Inbox carries SuprSend branding. Essentials is **$100/month** for 50k, then $0.002 each. Business is $250/month. On Free, SuprSend keeps sending above 10k and contacts you.
  - **React:** `@suprsend/react`. The older `@suprsend/react-inbox` is end-of-support. Inbox auth moved from HMAC to signed JWT ([SuprSend React inbox](https://docs.suprsend.com/docs/inbox-react)).
  - **Not checked:** realtime transport, state model and Node SDK shape (**unverified**).
  - **Cost at ~20k/month:** ~$100/month.
- **Liveblocks Notifications.**
  - **Features:** project-level inbox notifications. Custom server-sent kinds go through `liveblocks.triggerInboxNotification` (kind must start with `$`). React hooks include `useInboxNotifications`. Email works via Liveblocks webhooks that your code turns into emails ([concepts](https://liveblocks.io/docs/products/notifications/concepts)).
  - **Fit:** it is built around Liveblocks' collaboration products, and the pricing pages found disagree with each other ([pricing](https://liveblocks.io/pricing)). Noted for completeness and not compared further.
- **Engagespot.** Not evaluated (no primary-source check done).

## 6. Build: a `notifications` table in Cadence's SQLite

1. **Component.** None ready-made. You build the bell and popover with the existing shadcn/Radix UI kit (`radix-ui`, `lucide-react` `Bell` icon, `sonner` for toasts, all already dependencies). Size estimate (**unverified**):
   - A `<NotificationBell>` in `sidebar.tsx` fed by the `layout.app.tsx` loader.
   - A `/notifications` route or popover.
   - A `useFetcher` "mark read" action following the repo's `intent` pattern.
2. **Cost.** $0 marginal. It is a table in the existing `data.db`. At ~20k rows/month (~240k/year) SQLite in WAL mode is well within range, provided there is an index on `(user_id, read_at)` or similar (sizing judgement, **unverified** for this workload).
3. **Self-hosting.** Inherent: it uses the existing database and process. There are no new services or vendor tokens.
4. **Realtime.** Nothing exists today (see §0), so choose one:
   - **(a) Revalidation only.** Put the unread count in the `layout.app.tsx` loader. It refreshes on navigation and after any action. It does not reflect other users' actions until the next navigation.
   - **(b) Polling.** `useRevalidator().revalidate()` on an interval or on window focus. React Router's docs list exactly "Window focus or polling on an interval" as its use case ([useRevalidator](https://reactrouter.com/api/hooks/useRevalidator)). Re-running the whole layout loader is the cost, because that loader also computes course progress. A small resource route returning only the count is cheaper.
   - **(c) Server-Sent Events.** A resource route (loader, no default export) returns a `Response` with a streaming body ([resource routes](https://reactrouter.com/how-to/resource-routes)) and `Content-Type: text/event-stream`. An in-process `EventEmitter` works because Cadence runs as a single `react-router-serve` process on one SQLite file. That assumption breaks if the app ever runs more than one process. This needs new code and long-lived connections, and nothing in the repo does this today.
5. **State.** Whatever you model. Following the repo's nullable-timestamp convention (`editedAt`, `deletedAt`), that means `seenAt`, `readAt` and `archivedAt` columns. Mark-all-read becomes one `UPDATE … WHERE user_id = ? AND read_at IS NULL`. There are no vendor limits, and also no vendor-provided preferences, digests or batching.
6. **Email later.** Entirely on you. You need:
   - an email provider SDK (none installed);
   - templates;
   - a sending path that does not block the action (there is no job queue in the repo);
   - unsubscribe/preference handling;
   - possibly a `notification_deliveries` table.

   This is the largest gap against the hosted options.
7. **Triggering.**
   - A plain synchronous function, for example `createNotification({ userId, type: "comment.created", lessonId, commentId })`, which wraps `db.insert(notifications).values(...).run()`.
   - It is called inside the existing actions, ideally in the same transaction as the comment insert.
   - Because `createComment` is duplicated in two route files (§0), both call sites need it, or the function needs extracting first.
   - Recipient resolution happens in Cadence's own queries: the course instructor for Questions, and the thread participants for replies.
   - **Migration:** a new Drizzle migration plus a seed update (see the repo's `database-migrations` skill).

---

## Comparison table

Prices are as read 2026-11-11, at the ~20k in-app notifications/month assumption.

| Option | (1) React bell/feed | (2) Free tier / cost at ~20k/mo | (3) Self-host | (4) Realtime | (5) State / mark-all-read | (6) Add email later | (7) Node trigger |
|---|---|---|---|---|---|---|---|
| **Knock** | `@knocklabs/react` (`NotificationIconButton`, `NotificationFeedPopover`) | 10k messages free → Starter **$250/mo** (50k) | No | WebSocket | seen / read / interacted / archived; mark-all-read yes | Email step in same workflow; +1 message per email | `@knocklabs/node` `workflows.trigger(key, {recipients, data})` |
| **Novu Cloud** | `@novu/react` `<Inbox />` (Bell, Notifications) | 10k runs free → Pro **~$30/mo** (30k); branding removal paid | — | WebSocket (PartySocket) | read / seen / archived / snooze; `readAll`, `seenAll`, `archiveAll` | Email on all plans; same run | `@novu/api` `trigger({workflowId, to, payload})` |
| **Novu self-hosted (Community)** | same | Free (MIT core); you run MongoDB + Redis + S3 + 3 services | Yes | WebSocket (socket.io) | as Cloud, minus snooze | Yes; no email activity tracking | same, pointed at own API |
| **Courier** | `@trycourier/courier-react` (`CourierInboxPopupMenu`); old `react-inbox` deprecated | 10k sends free → **~$50–100/mo** at $0.005/send (unverified) | No | WebSocket (no pushed count) | read / opened / archived; `readAll`, `archiveAll` | Multi-channel send; counting partly unverified | `@trycourier/courier` `send.message({message})` |
| **MagicBell** | `@magicbell/react` (`FloatingInbox`, `InboxButton`) | 1k deliveries free → Startup **$249/mo** (50k) | No | WebSocket (Ably, per status page) | read / seen / archived; mark-all-read unverified | Email channel listed | `magicbell-js` `broadcasts.createBroadcast({...})` |
| **SuprSend** (brief) | `@suprsend/react` (old `react-inbox` EOL) | 10k free (branded) → Essentials **$100/mo** (50k) | Not checked | Unverified | Unverified | Multi-channel | Unverified |
| **Build on SQLite** | None; build with existing shadcn/Radix | **$0** marginal | Inherent | None today; revalidation / polling / SSE to build | Your columns; one `UPDATE` | All on you (provider, templates, queue, prefs) | Local fn inside existing actions |

## Trade-offs (neutral summary)

- **Cost spread at cohort scale is wide.**
  - At ≤10k notifications/month, Knock, Novu, Courier and SuprSend are all free (MagicBell's free tier is 1k).
  - At ~20k, monthly cost ranges from ~$30 (Novu Pro) through ~$50–100 (Courier, SuprSend) to ~$250 (Knock, MagicBell).
  - Building costs $0 in fees but costs engineering time.
- **Billing units differ.** Novu bills per workflow run (one per subscriber per trigger), so adding email to the same workflow does not add a billable unit. Knock, MagicBell and SuprSend bill per message or delivery per channel, so email roughly doubles usage. Courier's counting rules come from marketing guides and are partly unverified.
- **Hosted vendors handle the hard parts.** All hosted vendors provide a drop-in bell and feed, realtime over WebSocket, multi-state read models with bulk actions, and an email path. Each needs a server-signed user token or HMAC, a second source of truth for recipients and subscribers, and an outbound HTTP call inside Cadence's actions.
- **Self-hosting is only realistic with Novu**, and its Community edition needs MongoDB, Redis and S3 plus several services. That footprint is far heavier than Cadence's single SQLite file.
- **Building fits the repo but leaves gaps.** It matches Cadence's existing patterns (Drizzle, synchronous inserts in `intent`-based actions, layout-loader data) and keeps notification data next to Comments, transactionally. Cadence has no realtime channel, no email library and no job queue today, so "live" badges and "email later" are the parts that would have to be built from scratch.
