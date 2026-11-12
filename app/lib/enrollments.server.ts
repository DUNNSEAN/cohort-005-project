import { and, eq } from "drizzle-orm";
import { courses, enrollments, NotificationKind } from "~/db/schema";
import type { Tx } from "~/db";
import { createNotifications } from "~/lib/notifications.server";

/**
 * Enrols a person on a course, for an Individual Purchase or a Claimed Seat,
 * and notifies the course's Instructor. Runs inside the caller's transaction
 * so the Notification commits or rolls back with the Enrollment. Throws an
 * Error with a user-facing message when the person is already enrolled or the
 * course doesn't exist.
 */
export function enrollStudent(tx: Tx, userId: number, courseId: number) {
  const existing = tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
  if (existing) {
    throw new Error("You are already enrolled in this course");
  }

  const course = tx
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    throw new Error("Course not found");
  }

  const enrollment = tx
    .insert(enrollments)
    .values({ userId, courseId })
    .returning()
    .get();

  createNotifications(tx, {
    kind: NotificationKind.Enrollment,
    enrollmentId: enrollment.id,
  });

  return enrollment;
}
