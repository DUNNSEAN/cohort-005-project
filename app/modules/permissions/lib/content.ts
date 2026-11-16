import { data } from "react-router";
import { and, eq } from "drizzle-orm";
import { enrollments, lessons, modules, purchases } from "~/db/schema";
import { resolveCountry } from "~/lib/country.server";
import { countryName } from "~/lib/ppp";
import {
  canManage,
  courseNotFound,
  findCourse,
  findSignedIn,
  requireSignedIn,
  toViewer,
  type Course,
  type Db,
  type Viewer,
} from "./permissions";
import { findPppBlock } from "./ppp-block";

export type ContentVerdict =
  | { allowed: true }
  | { allowed: false; reason: "signed-out" | "not-enrolled" }
  | {
      allowed: false;
      reason: "ppp-blocked";
      purchaseCountry: string;
      currentCountry: string;
    };

/** May this person read a course's content (lesson bodies, comments)? */
export type ContentPermission = {
  viewer: Viewer | null;
  enrolled: boolean;
  /** The Owning Instructor or a Platform Admin. */
  canManage: boolean;
  verdict: ContentVerdict;
};

/**
 * The Owning Instructor and Platform Admins may always read a course's
 * content. A Student needs an Enrollment that a PPP block doesn't stop.
 */
export async function contentPermission(
  db: Db,
  request: Request,
  course: Course
): Promise<ContentPermission> {
  const signedIn = await findSignedIn(db, request);
  if (!signedIn) {
    return {
      viewer: null,
      enrolled: false,
      canManage: false,
      verdict: { allowed: false, reason: "signed-out" },
    };
  }

  const viewer = toViewer(signedIn);
  const manages = canManage(signedIn, course);
  const { enrolled, verdict } = await studentVerdict(
    db,
    request,
    signedIn.userId,
    course
  );
  return {
    viewer,
    enrolled,
    canManage: manages,
    verdict: manages ? { allowed: true } : verdict,
  };
}

/** A Student's verdict: an Enrollment that a PPP block doesn't stop. */
async function studentVerdict(
  db: Db,
  request: Request,
  userId: number,
  course: Course
): Promise<{ enrolled: boolean; verdict: ContentVerdict }> {
  const enrolled = !!db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, course.id))
    )
    .get();
  if (!enrolled) {
    return { enrolled, verdict: { allowed: false, reason: "not-enrolled" } };
  }

  const purchase = db
    .select({ country: purchases.country })
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, course.id)))
    .get();
  const block = findPppBlock(
    course,
    purchase?.country ?? null,
    await resolveCountry(request)
  );
  if (block) {
    return {
      enrolled,
      verdict: { allowed: false, reason: "ppp-blocked", ...block },
    };
  }
  return { enrolled, verdict: { allowed: true } };
}

/**
 * Rating a course is for its Students: an Enrollment a PPP block doesn't
 * stop. The Owning Instructor can't rate their own course, and a Platform
 * Admin needs an Enrollment like anyone else.
 */
export async function requireCanRateCourse(
  db: Db,
  request: Request,
  course: Course
): Promise<Viewer> {
  const signedIn = await requireSignedIn(db, request);
  if (course.instructorId === signedIn.userId) {
    throw data("You can't rate your own course.", { status: 403 });
  }
  const { verdict } = await studentVerdict(
    db,
    request,
    signedIn.userId,
    course
  );
  return requireAllowed({
    viewer: toViewer(signedIn),
    enrolled: true,
    canManage: false,
    verdict,
  });
}

/** The course a lesson belongs to. 404 when the lesson doesn't exist. */
export function lessonCourse(db: Db, lessonId: number): Course {
  const row = db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get();
  if (!row) throw data("Lesson not found.", { status: 404 });
  return findCourse(db, row.courseId) ?? courseNotFound();
}

export function requireCourse(db: Db, courseId: number): Course {
  return findCourse(db, courseId) ?? courseNotFound();
}

/** Throws the response for a denied verdict; returns the Viewer otherwise. */
export function requireAllowed(permission: ContentPermission): Viewer {
  const { verdict, viewer } = permission;
  if (verdict.allowed && viewer) return viewer;
  if (!verdict.allowed && verdict.reason === "ppp-blocked") {
    throw data(
      `This course was bought at the regional price for ${countryName(verdict.purchaseCountry)}, so it can't be viewed from ${countryName(verdict.currentCountry)}.`,
      { status: 403 }
    );
  }
  if (!verdict.allowed && verdict.reason === "not-enrolled") {
    throw data("You must be enrolled in this course.", { status: 403 });
  }
  throw data("Select a user from the DevUI panel.", { status: 401 });
}
