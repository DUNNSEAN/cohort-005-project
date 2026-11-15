import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";

export type Db = BetterSQLite3Database<typeof schema>;

/** Who is asking. Every `require…` function returns one. */
export type Viewer = { userId: number; isPlatformAdmin: boolean };

/** A Viewer plus their role. Internal: callers never see the role. */
type SignedIn = Viewer & { role: UserRole };

const SIGNED_OUT = "Select a user from the DevUI panel.";

export function signedOut(): never {
  throw data(SIGNED_OUT, { status: 401 });
}

export function toViewer({ userId, isPlatformAdmin }: SignedIn): Viewer {
  return { userId, isPlatformAdmin };
}

/**
 * The person behind the request, or null when nobody is signed in. A session
 * pointing at a user who no longer exists counts as signed out.
 */
export async function findSignedIn(
  db: Db,
  request: Request
): Promise<SignedIn | null> {
  const userId = await getCurrentUserId(request);
  if (!userId) return null;

  const user = db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user) return null;

  return {
    userId: user.id,
    role: user.role,
    isPlatformAdmin: user.role === UserRole.Admin,
  };
}

export async function requireSignedIn(
  db: Db,
  request: Request
): Promise<SignedIn> {
  return (await findSignedIn(db, request)) ?? signedOut();
}
