import { db } from "~/db";
import {
  requireSignedIn,
  toViewer,
  type Db,
  type Viewer,
} from "./lib/permissions";

export type { Viewer } from "./lib/permissions";

/**
 * Every Permission on Cadence: what a person may do, decided by their role,
 * whether they are the Owning Instructor of a course, and their Enrollment.
 *
 * Each `require…` function either returns who is asking or throws a React
 * Router response: 401 when nobody is signed in, 403 when they may not, and
 * 404 when the course or lesson doesn't exist. Use them in actions as well as
 * loaders — loader guards don't protect actions.
 *
 * The app uses `permissions`, bound to the app database; tests build their
 * own against a test database.
 */
export function createPermissions(database: Db) {
  return {
    /** Anyone signed in. */
    async requireSignedIn(request: Request): Promise<Viewer> {
      return toViewer(await requireSignedIn(database, request));
    },
  };
}

export type Permissions = ReturnType<typeof createPermissions>;

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const permissions = /* @__PURE__ */ createPermissions(db);
