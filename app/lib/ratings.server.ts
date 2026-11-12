import { and, eq } from "drizzle-orm";
import { courseRatings, courses, NotificationKind } from "~/db/schema";
import type { Tx } from "~/db";
import { createNotifications } from "~/lib/notifications.server";
import { MAX_RATING, MIN_RATING } from "~/lib/ratings";

/**
 * Records a person's star rating for a course, or changes the one they gave
 * before. Only a first rating notifies the Instructor. Runs inside the
 * caller's transaction so the rating and its Notification commit or roll back
 * together. Throws an Error with a user-facing message when the input is
 * invalid.
 */
export function rateCourse(
  tx: Tx,
  userId: number,
  courseId: number,
  rating: number
) {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new Error(
      `Rating must be a whole number between ${MIN_RATING} and ${MAX_RATING}`
    );
  }

  const course = tx
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!course) {
    throw new Error("Course not found");
  }

  const existing = tx
    .select({ id: courseRatings.id })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();

  if (existing) {
    const updated = tx
      .update(courseRatings)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseRatings.id, existing.id))
      .returning()
      .get();
    return { ...updated, isFirstRating: false };
  }

  const created = tx
    .insert(courseRatings)
    .values({ userId, courseId, rating })
    .returning()
    .get();
  createNotifications(tx, {
    kind: NotificationKind.FirstRating,
    ratingId: created.id,
  });
  return { ...created, isFirstRating: true };
}
