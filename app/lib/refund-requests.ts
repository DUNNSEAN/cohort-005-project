import { RefundRequestStatus } from "~/db/schema";

// The rules for raising a Refund Request (see GLOSSARY.md). This file is free
// of database access so the course page, the action and the tests all share
// one copy of the rules.

export const REFUND_WINDOW_DAYS = 14;
export const REFUND_WATCH_LIMIT_SECONDS = 2 * 60 * 60;
export const REFUND_COMPLETION_LIMIT = 0.5;

/** Everything the rules need to know about one Purchase. */
export type RefundEligibilityFacts = {
  purchasedAt: string;
  now: Date;
  /** The newest Refund Request on this Purchase, if any. */
  latestRefundRequestStatus: RefundRequestStatus | null;
  isClaimedTeamSeat: boolean;
  secondsWatched: number;
  completedLessonCount: number;
  lessonCount: number;
};

export type RefundIneligibleReason =
  | "request-open"
  | "already-refunded"
  | "claimed-team-seat"
  | "window-closed"
  | "watched-too-much"
  | "completed-too-much";

export type RefundEligibility =
  | { eligible: true; lastDayOfRefundWindow: string }
  | { eligible: false; reason: RefundIneligibleReason };

// The Refund Window counts calendar days, not hours: someone who buys at
// 23:00 still gets the whole of their fourteenth day.
export function asCalendarDay(when: Date): string {
  const year = when.getFullYear();
  const month = String(when.getMonth() + 1).padStart(2, "0");
  const day = String(when.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function lastDayOfRefundWindow(purchasedAt: string): string {
  const deadline = new Date(purchasedAt);
  deadline.setDate(deadline.getDate() + REFUND_WINDOW_DAYS);
  return asCalendarDay(deadline);
}

export function checkRefundEligibility(
  facts: RefundEligibilityFacts
): RefundEligibility {
  // A Purchase can have several Refund Requests over time, but only one Open
  // at once. A Declined one may be raised again; an Approved one is final.
  if (facts.latestRefundRequestStatus === RefundRequestStatus.Open) {
    return { eligible: false, reason: "request-open" };
  }

  if (facts.latestRefundRequestStatus === RefundRequestStatus.Approved) {
    return { eligible: false, reason: "already-refunded" };
  }

  if (facts.isClaimedTeamSeat) {
    return { eligible: false, reason: "claimed-team-seat" };
  }

  const lastDay = lastDayOfRefundWindow(facts.purchasedAt);
  if (asCalendarDay(facts.now) > lastDay) {
    return { eligible: false, reason: "window-closed" };
  }

  if (facts.secondsWatched >= REFUND_WATCH_LIMIT_SECONDS) {
    return { eligible: false, reason: "watched-too-much" };
  }

  if (
    facts.lessonCount > 0 &&
    facts.completedLessonCount / facts.lessonCount >= REFUND_COMPLETION_LIMIT
  ) {
    return { eligible: false, reason: "completed-too-much" };
  }

  return { eligible: true, lastDayOfRefundWindow: lastDay };
}

/** What the student is told when the server turns a Refund Request away. */
export const REFUND_INELIGIBLE_MESSAGES: Record<RefundIneligibleReason, string> =
  {
    "request-open":
      "You already have an Open Refund Request for this purchase.",
    "already-refunded": "This purchase has already been refunded.",
    "claimed-team-seat":
      "A claimed team seat belongs to the team, so you cannot request a refund for it.",
    "window-closed": `The ${REFUND_WINDOW_DAYS}-day Refund Window has closed.`,
    "watched-too-much":
      "You have watched too much of this course to request a refund.",
    "completed-too-much":
      "You have completed too much of this course to request a refund.",
  };

/** The status a student sees on one of their Refund Requests. */
export const REFUND_REQUEST_STATUS_LABELS: Record<RefundRequestStatus, string> =
  {
    [RefundRequestStatus.Open]: "Open",
    [RefundRequestStatus.Approved]: "Approved",
    [RefundRequestStatus.Declined]: "Declined",
  };

/** The line on the course page that replaces the button once a request exists. */
export const REFUND_REQUEST_COURSE_PAGE_LINES: Record<
  RefundRequestStatus,
  string
> = {
  [RefundRequestStatus.Open]: "Refund Request open — a Platform Admin will decide it",
  [RefundRequestStatus.Declined]: "Refund Request declined",
  [RefundRequestStatus.Approved]: "Refund approved — access ends",
};
