import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  coupons,
  courses,
  users,
  enrollments,
  purchases,
  refundRequests,
  RefundRequestStatus,
  NotificationKind,
} from "~/db/schema";
import { createNotifications } from "~/lib/notifications.server";

// ─── Deciding Refund Requests ───
// A Platform Admin approves or declines an Open Refund Request. Each function
// takes the caller's transaction and does all of its work inside it, so the
// caller can add more (a Notification, say) and have it all land or none of
// it. See GLOSSARY.md and docs/adr/0001–0004.

export type Db = BetterSQLite3Database<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

type RefundRequest = typeof refundRequests.$inferSelect;
type Purchase = typeof purchases.$inferSelect;

export type RefundDecisionFailure = {
  ok: false;
  status: 400 | 404 | 409;
  error: string;
};

export type RefundDecisionResult =
  | { ok: true; refundRequest: RefundRequest; purchase: Purchase }
  | RefundDecisionFailure;

function findOpenRefundRequest(
  tx: Tx,
  refundRequestId: number
):
  | { ok: true; refundRequest: RefundRequest; purchase: Purchase }
  | RefundDecisionFailure {
  const refundRequest = tx
    .select()
    .from(refundRequests)
    .where(eq(refundRequests.id, refundRequestId))
    .get();

  if (!refundRequest) {
    return { ok: false, status: 404, error: "Refund Request not found." };
  }

  // The first decision wins. A second Platform Admin deciding the same
  // Refund Request is told it has already been decided.
  if (refundRequest.status !== RefundRequestStatus.Open) {
    return {
      ok: false,
      status: 409,
      error: `This Refund Request has already been ${refundRequest.status}.`,
    };
  }

  const purchase = tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, refundRequest.purchaseId))
    .get();

  if (!purchase) {
    return { ok: false, status: 404, error: "Purchase not found." };
  }

  return { ok: true, refundRequest, purchase };
}

/**
 * Declines an Open Refund Request. Nothing the Purchase granted is lost, and
 * the buyer may raise a new Refund Request. The reason is required: the buyer
 * sees it.
 */
export function declineRefundRequest(
  tx: Tx,
  refundRequestId: number,
  platformAdminId: number,
  reason: string,
  now: Date
): RefundDecisionResult {
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    return {
      ok: false,
      status: 400,
      error: "Tell the buyer why their Refund Request was declined.",
    };
  }

  const found = findOpenRefundRequest(tx, refundRequestId);
  if (!found.ok) return found;

  const refundRequest = tx
    .update(refundRequests)
    .set({
      status: RefundRequestStatus.Declined,
      declineReason: trimmedReason,
      resolvedAt: now.toISOString(),
      resolvedByUserId: platformAdminId,
    })
    .where(eq(refundRequests.id, refundRequestId))
    .returning()
    .get();

  createNotifications(tx, {
    kind: NotificationKind.RefundDecision,
    refundRequestId,
  });

  return { ok: true, refundRequest, purchase: found.purchase };
}

function holdsClaimedSeat(tx: Tx, userId: number, courseId: number) {
  return Boolean(
    tx
      .select({ id: coupons.id })
      .from(coupons)
      .where(
        and(
          eq(coupons.redeemedByUserId, userId),
          eq(coupons.courseId, courseId),
          isNotNull(coupons.redeemedAt)
        )
      )
      .get()
  );
}

/**
 * Approves an Open Refund Request and records a Pending Refund of the full
 * amount paid.
 *
 * - An Individual Purchase: the buyer loses their Enrollment at once
 *   (docs/adr/0002), unless they also hold a Claimed Seat for the course
 *   (docs/adr/0004). Their progress, watch history, quiz attempts, Comments
 *   and rating stay (docs/adr/0001).
 * - A Team Licence: refused if any Seat has been claimed. Otherwise its
 *   Unclaimed Seats can never be claimed (docs/adr/0003, see getSeatFreeze).
 */
export function approveRefundRequest(
  tx: Tx,
  refundRequestId: number,
  platformAdminId: number,
  now: Date
): RefundDecisionResult {
  const found = findOpenRefundRequest(tx, refundRequestId);
  if (!found.ok) return found;

  const { purchase } = found;
  const seats = tx
    .select({ redeemedAt: coupons.redeemedAt })
    .from(coupons)
    .where(eq(coupons.purchaseId, purchase.id))
    .all();

  // A Team Licence is the Purchase that granted Seats. It gives its buyer no
  // Enrollment, so there is none to end.
  if (seats.length > 0) {
    if (seats.some((seat) => seat.redeemedAt !== null)) {
      return {
        ok: false,
        status: 409,
        error:
          "A Seat on this Team Licence has been claimed, so this Refund Request can only be declined.",
      };
    }
  } else if (!holdsClaimedSeat(tx, purchase.userId, purchase.courseId)) {
    tx.delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, purchase.userId),
          eq(enrollments.courseId, purchase.courseId)
        )
      )
      .run();
  }

  const refundRequest = tx
    .update(refundRequests)
    .set({
      status: RefundRequestStatus.Approved,
      amountRefunded: purchase.amountPaid,
      resolvedAt: now.toISOString(),
      resolvedByUserId: platformAdminId,
    })
    .where(eq(refundRequests.id, refundRequestId))
    .returning()
    .get();

  createNotifications(tx, {
    kind: NotificationKind.RefundDecision,
    refundRequestId,
  });

  return { ok: true, refundRequest, purchase };
}

export type OpenRefundRequest = {
  id: number;
  reason: string;
  requestedAt: string;
  buyerName: string;
  buyerEmail: string;
  courseTitle: string;
  courseSlug: string;
  amountPaid: number;
  purchasedAt: string;
  purchase:
    | { kind: "individual-purchase" }
    | { kind: "team-licence"; seatCount: number; claimedSeatCount: number };
  /** False for a Team Licence with a Claimed Seat: it can only be declined. */
  canApprove: boolean;
};

/** The Refund Requests waiting for a Platform Admin, oldest first. */
export function listOpenRefundRequests(db: Db | Tx): OpenRefundRequest[] {
  const rows = db
    .select({
      id: refundRequests.id,
      reason: refundRequests.reason,
      requestedAt: refundRequests.requestedAt,
      buyerName: users.name,
      buyerEmail: users.email,
      courseTitle: courses.title,
      courseSlug: courses.slug,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      purchasedAt: purchases.createdAt,
    })
    .from(refundRequests)
    .innerJoin(purchases, eq(refundRequests.purchaseId, purchases.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .where(eq(refundRequests.status, RefundRequestStatus.Open))
    .orderBy(asc(refundRequests.requestedAt), asc(refundRequests.id))
    .all();

  return rows.map(({ purchaseId, ...row }) => {
    const seats = db
      .select({ redeemedAt: coupons.redeemedAt })
      .from(coupons)
      .where(eq(coupons.purchaseId, purchaseId))
      .all();

    if (seats.length === 0) {
      return {
        ...row,
        purchase: { kind: "individual-purchase" },
        canApprove: true,
      };
    }

    const claimedSeatCount = seats.filter(
      (seat) => seat.redeemedAt !== null
    ).length;
    return {
      ...row,
      purchase: {
        kind: "team-licence",
        seatCount: seats.length,
        claimedSeatCount,
      },
      canApprove: claimedSeatCount === 0,
    };
  });
}

export type SeatFreeze ="refund-request-open" | "refunded";

/**
 * Why a Team Licence's Unclaimed Seats can't be claimed right now, or null if
 * they can. They freeze while it has an Open Refund Request, work again if it
 * is declined, and can never be claimed once it is approved (docs/adr/0003).
 */
export function getSeatFreeze(
  db: Db | Tx,
  purchaseId: number
): SeatFreeze | null {
  const blocking = db
    .select({ status: refundRequests.status })
    .from(refundRequests)
    .where(
      and(
        eq(refundRequests.purchaseId, purchaseId),
        inArray(refundRequests.status, [
          RefundRequestStatus.Open,
          RefundRequestStatus.Approved,
        ])
      )
    )
    .all();

  if (blocking.some((row) => row.status === RefundRequestStatus.Approved)) {
    return "refunded";
  }
  if (blocking.length > 0) return "refund-request-open";
  return null;
}
