import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "~/db";
import {
  coupons,
  lessonProgress,
  lessons,
  LessonProgressStatus,
  modules,
  purchases,
  refundRequests,
  videoWatchEvents,
} from "~/db/schema";
import { checkRefundEligibility } from "~/lib/refund-requests";

/** The learner's most recent Purchase of a course, if they have one. */
export function getLatestPurchase(userId: number, courseId: number) {
  return db
    .select()
    .from(purchases)
    .where(and(eq(purchases.userId, userId), eq(purchases.courseId, courseId)))
    .orderBy(sql`${purchases.createdAt} desc`)
    .get();
}

/** The newest Refund Request on a Purchase: it can have several over time. */
export function getLatestRefundRequestForPurchase(purchaseId: number) {
  return db
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.purchaseId, purchaseId))
    .orderBy(desc(refundRequests.requestedAt), desc(refundRequests.id))
    .get();
}

function getLessonIdsForCourse(courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

// Watched time is the furthest point reached in each lesson, summed.
function getSecondsWatched(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

function getCompletedLessonCount(userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;

  return (
    db
      .select({ count: sql<number>`count(*)` })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          eq(lessonProgress.status, LessonProgressStatus.Completed),
          inArray(lessonProgress.lessonId, lessonIds)
        )
      )
      .get()?.count ?? 0
  );
}

// A seat that came out of a team licence, and has been claimed, belongs to
// the team — the learner cannot hand it back on their own.
function isClaimedTeamSeat(purchaseId: number) {
  return Boolean(
    db
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(eq(coupons.purchaseId, purchaseId), isNotNull(coupons.redeemedAt))
      )
      .get()
  );
}

/**
 * Where a learner stands on getting their money back for a course: their
 * latest Purchase, the newest Refund Request on it, and whether they may
 * raise one.
 * Null when they have not bought the course.
 */
export function getRefundStanding(userId: number, courseId: number) {
  const purchase = getLatestPurchase(userId, courseId);
  if (!purchase) return null;

  const refundRequest = getLatestRefundRequestForPurchase(purchase.id) ?? null;
  const lessonIds = getLessonIdsForCourse(courseId);

  const eligibility = checkRefundEligibility({
    purchasedAt: purchase.createdAt,
    now: new Date(),
    latestRefundRequestStatus: refundRequest?.status ?? null,
    isClaimedTeamSeat: isClaimedTeamSeat(purchase.id),
    secondsWatched: getSecondsWatched(userId, lessonIds),
    completedLessonCount: getCompletedLessonCount(userId, lessonIds),
    lessonCount: lessonIds.length,
  });

  return { purchase, refundRequest, eligibility };
}
