---
name: run-app
description: Launch Cadence locally and act as a seeded Student, Instructor or Platform Admin. Use when running or screenshotting the app, checking a change in the browser, or putting screenshots on a PR.
---

# Run the app

## 1. Reseed

```bash
npm run db:seed
```

`data.db` is disposable: the seed deletes it, replays every migration in `drizzle/` and inserts fresh rows. Reseeding on every launch means the database always matches the branch's schema, so skip `npm run db:migrate`.

Done when the seed prints `✓ Seed complete!` and exits 0.

## 2. Start the dev server

```bash
npm run dev -- --port 5199 --strictPort
```

Run it in the background. `--strictPort` makes a port clash fail loudly instead of moving to another port. Done when `curl -s -o /dev/null -w '%{http_code}' http://localhost:5199/` prints `200`.

## 3. Act as a seeded user

There is no login. The session holds a user id, set by posting to `/api/switch-user`. From a page on the app (the browser keeps the cookie):

```js
const fd = new FormData();
fd.append("userId", "5");
await fetch("/api/switch-user", { method: "POST", body: fd, redirect: "manual" });
```

Then navigate to the page you want. The DevUI panel (bottom right) does the same by hand, and also sets the buyer's country through `/api/set-dev-country` (`country`: a two-letter code, or empty to clear it).

Pick by what the screen needs:

| Person | Role | Useful for |
| --- | --- | --- |
| Emma Wilson | Student | Enrolled on courses 1 and 2, nearly done with course 1 |
| Sarah Chen | Instructor | Owns courses 1 (`introduction-to-typescript`) and 3 |
| Marcus Johnson | Instructor | Owns courses 2, 4 and the draft course 5 |
| Priya Nair | Instructor | Owns no courses: the empty Instructor views |
| Bossy McBossface | Student, Team Admin | Bought a Team Licence for course 2 |
| Alex Rivera | Platform Admin | Admin screens, deciding Refund Requests |

Ids follow insert order in `scripts/seed.ts`. Read the current one rather than assuming it:

```bash
sqlite3 data.db "select id, name, role from users where name = 'Emma Wilson';"
```

## 4. Screenshot

Minimise the DevUI panel (the chevron in its header) before each screenshot so it doesn't cover the page. Save every screenshot to disk so it can be uploaded.

Take PR evidence at the commit the PR will merge. A screenshot from before a later fix shows code that no longer exists.

To put screenshots in a PR body, follow [UPLOADING-TO-GITHUB.md](UPLOADING-TO-GITHUB.md).

## 5. Clean up

Stop the dev server you started and close the tabs you opened.
