---
name: database-migrations
description: Database schema changes — generate the migration, update the seed, reseed. Use when editing `app/db/schema.ts`, when adding or altering a table, column, or enum, or when `npm run db:seed` fails.
---

# Database Migrations

The database is **disposable**. `data.db` is gitignored and holds nothing but seed data, so every schema change is free: migrate, throw the file away, reseed from scratch.

Disposable is also why `scripts/seed.ts` is part of every schema change rather than a follow-up. The seed script is the definition of the starting data, and it recreates the whole database on each run — so a schema change that skips it produces data whose shape no longer matches the schema.

## Steps

1. **Edit the schema** — `app/db/schema.ts`.

2. **Generate the migration** — `npm run db:generate`. This writes a new numbered SQL file into `drizzle/`. Read it and confirm it says what you intended.

3. **Update `scripts/seed.ts`** for every table you touched:
   - **New table** — insert rows for it.
   - **New non-nullable column** — give it a value in every `.values({ ... })` call for that table.
   - **Renamed or removed column** — rename or remove it at every insert site for that table.
   - **New enum** — import it from `../app/db/schema` and use its members at the insert sites, matching how `UserRole` and `CourseStatus` are used.

4. **Reseed** — `npm run db:seed`. It deletes `data.db`, replays the migrations in `drizzle/`, and reinserts. It prints a summary of row counts when it finishes.

5. **Typecheck** — `npm run typecheck`.

Done when every table changed in step 1 is accounted for in step 3, `npm run db:seed` prints its summary, and the typecheck passes.

## `npm run db:migrate`

`npm run db:migrate` applies pending migrations to the existing `data.db`, preserving the rows already in it. The seed already migrates before it inserts, so the steps above never need it. Reach for it when you specifically want to watch a migration land on existing data.
