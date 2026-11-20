import { db } from "~/db";
import {
  getCourseCatalog,
  type CatalogFilters,
  type CatalogViewer,
  type Db,
} from "./lib/course-catalog";

export type { CatalogFilters, CatalogViewer } from "./lib/course-catalog";

/**
 * The course catalogue bound to a database. The app uses `courseCatalog`,
 * which reads the app database; tests build their own against a test
 * database.
 */
export function createCourseCatalog(database: Db) {
  return {
    /**
     * The newest 50 published courses matching the search and category, and
     * every category for the filter. Each course carries its lesson count,
     * rating, price in the viewer's country, and whether the viewer has an
     * Enrollment on it (`isEnrolled`) with their progress. Progress is null
     * on a course the viewer is not enrolled on, even one they once had.
     */
    list(viewer: CatalogViewer, filters: CatalogFilters) {
      return getCourseCatalog(database, viewer, filters);
    },
  };
}

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const courseCatalog = /* @__PURE__ */ createCourseCatalog(db);
