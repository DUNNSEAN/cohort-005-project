import { db } from "~/db";
import {
  requireCanCreateCourse,
  requireCanManageCourse,
  requireInstructor,
  requirePlatformAdmin,
  requireSignedIn,
  toViewer,
  type Course,
  type Db,
  type Viewer,
} from "./lib/permissions";

import {
  contentPermission,
  lessonCourse,
  requireAllowed,
  requireCanRateCourse,
  requireCourse,
  type ContentPermission,
} from "./lib/content";

export type { Course, Viewer } from "./lib/permissions";
export type { ContentPermission, ContentVerdict } from "./lib/content";

export type LessonPermission = ContentPermission & { courseId: number };

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

    /** Only a Platform Admin. */
    async requirePlatformAdmin(request: Request): Promise<Viewer> {
      return toViewer(await requirePlatformAdmin(database, request));
    },

    /**
     * An Instructor or a Platform Admin, for pages that span all of someone's
     * courses rather than one course.
     */
    async requireInstructor(request: Request): Promise<Viewer> {
      return toViewer(await requireInstructor(database, request));
    },

    /** Only an Instructor: a Platform Admin can't create courses. */
    async requireCanCreateCourse(request: Request): Promise<Viewer> {
      return toViewer(await requireCanCreateCourse(database, request));
    },

    /**
     * The course's Owning Instructor, or a Platform Admin. Returns the course
     * row it loaded so the caller needn't fetch it again. 404 when the course
     * doesn't exist, checked before ownership.
     */
    async requireCanManageCourse(
      request: Request,
      courseId: number
    ): Promise<{ viewer: Viewer; course: Course }> {
      const { signedIn, course } = await requireCanManageCourse(
        database,
        request,
        courseId
      );
      return { viewer: toViewer(signedIn), course };
    },

    /**
     * May they rate this course? Students with an Enrollment that a PPP block
     * doesn't stop. Never the Owning Instructor; a Platform Admin needs an
     * Enrollment like anyone else. 401 signed out, 403 otherwise, 404 when
     * the course doesn't exist.
     */
    async requireCanRateCourse(
      request: Request,
      courseId: number
    ): Promise<Viewer> {
      return requireCanRateCourse(
        database,
        request,
        requireCourse(database, courseId)
      );
    },

    /**
     * May they read this lesson? Checked against the course the lesson
     * belongs to, whatever course the URL names. 401 signed out,
     * 403 not enrolled or PPP-blocked, 404 when the lesson doesn't exist.
     */
    async requireCanViewLesson(
      request: Request,
      lessonId: number
    ): Promise<{ viewer: Viewer; canManage: boolean; courseId: number }> {
      const course = lessonCourse(database, lessonId);
      const permission = await contentPermission(database, request, course);
      return {
        viewer: requireAllowed(permission),
        canManage: permission.canManage,
        courseId: course.id,
      };
    },

    /**
     * The same question as `requireCanViewLesson`, answered without
     * throwing, so the lesson page can render a paywall preview for people
     * who may not read it. Only a missing lesson throws (404).
     */
    async lessonPermission(
      request: Request,
      lessonId: number
    ): Promise<LessonPermission> {
      const course = lessonCourse(database, lessonId);
      const permission = await contentPermission(database, request, course);
      return { ...permission, courseId: course.id };
    },
  };
}

export type Permissions = ReturnType<typeof createPermissions>;

// Pure so a route importing this only for its loader doesn't pull the
// database into the client bundle (see `~/db`).
export const permissions = /* @__PURE__ */ createPermissions(db);
