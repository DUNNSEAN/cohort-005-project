import { data } from "react-router";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, courses, users } from "~/db/schema";
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

export async function requirePlatformAdmin(
  db: Db,
  request: Request
): Promise<SignedIn> {
  const signedIn = await requireSignedIn(db, request);
  if (!signedIn.isPlatformAdmin) {
    throw data("Only Platform Admins can do that.", { status: 403 });
  }
  return signedIn;
}

/** An Instructor, or a Platform Admin, who may see every instructor page. */
export async function requireInstructor(
  db: Db,
  request: Request
): Promise<SignedIn> {
  const signedIn = await requireSignedIn(db, request);
  if (signedIn.role !== UserRole.Instructor && !signedIn.isPlatformAdmin) {
    throw data("Only Instructors can do that.", { status: 403 });
  }
  return signedIn;
}

/**
 * Only an Instructor. Creating a course makes you its Owning Instructor, which
 * a Platform Admin is not.
 */
export async function requireCanCreateCourse(
  db: Db,
  request: Request
): Promise<SignedIn> {
  const signedIn = await requireSignedIn(db, request);
  if (signedIn.role !== UserRole.Instructor) {
    throw data("Only Instructors can create courses.", { status: 403 });
  }
  return signedIn;
}

export type Course = typeof courses.$inferSelect;

/**
 * The Owning Instructor or a Platform Admin. Ownership alone isn't enough:
 * someone who is no longer an Instructor stops owning their courses.
 */
export function canManage(signedIn: SignedIn, course: Course): boolean {
  return (
    signedIn.isPlatformAdmin ||
    (signedIn.role === UserRole.Instructor &&
      course.instructorId === signedIn.userId)
  );
}

export function courseNotFound(): never {
  throw data("Course not found.", { status: 404 });
}

export function findCourse(db: Db, courseId: number): Course | undefined {
  return db.select().from(courses).where(eq(courses.id, courseId)).get();
}

export async function requireCanManageCourse(
  db: Db,
  request: Request,
  courseId: number
): Promise<{ signedIn: SignedIn; course: Course }> {
  const signedIn = await requireSignedIn(db, request);
  const course = findCourse(db, courseId) ?? courseNotFound();
  if (!canManage(signedIn, course)) {
    throw data("Only this course's Instructor can do that.", { status: 403 });
  }
  return { signedIn, course };
}
