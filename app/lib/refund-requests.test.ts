import { describe, it, expect } from "vitest";
import {
  REFUND_COMPLETION_LIMIT,
  REFUND_WATCH_LIMIT_SECONDS,
  checkRefundEligibility,
  lastDayOfRefundWindow,
  type RefundEligibilityFacts,
} from "./refund-requests";
import { RefundRequestStatus } from "~/db/schema";

// Bought late in the evening, local time, so the calendar-day rule matters.
const PURCHASED_AT = new Date(2026, 0, 1, 23, 0).toISOString();

function facts(overrides: Partial<RefundEligibilityFacts> = {}) {
  return {
    purchasedAt: PURCHASED_AT,
    now: new Date(2026, 0, 5, 12, 0),
    latestRefundRequestStatus: null,
    isClaimedTeamSeat: false,
    secondsWatched: 0,
    completedLessonCount: 0,
    lessonCount: 10,
    ...overrides,
  };
}

describe("checkRefundEligibility", () => {
  it("lets a student who has barely started raise a Refund Request", () => {
    expect(checkRefundEligibility(facts())).toEqual({
      eligible: true,
      lastDayOfRefundWindow: "2026-01-15",
    });
  });

  describe("the Refund Window", () => {
    it("is 14 calendar days and includes the whole fourteenth day", () => {
      expect(lastDayOfRefundWindow(PURCHASED_AT)).toBe("2026-01-15");

      const lateOnLastDay = new Date(2026, 0, 15, 23, 59);
      expect(checkRefundEligibility(facts({ now: lateOnLastDay })).eligible).toBe(
        true
      );
    });

    it("has closed the day after", () => {
      const dayAfter = new Date(2026, 0, 16, 0, 1);
      expect(checkRefundEligibility(facts({ now: dayAfter }))).toEqual({
        eligible: false,
        reason: "window-closed",
      });
    });
  });

  describe("earlier Refund Requests on the Purchase", () => {
    it("refuses a second while one is Open", () => {
      expect(
        checkRefundEligibility(
          facts({ latestRefundRequestStatus: RefundRequestStatus.Open })
        )
      ).toEqual({ eligible: false, reason: "request-open" });
    });

    it("allows a new one after a Decline, so a Decline is not final", () => {
      expect(
        checkRefundEligibility(
          facts({ latestRefundRequestStatus: RefundRequestStatus.Declined })
        ).eligible
      ).toBe(true);
    });

    it("refuses one once a Refund Request has been approved", () => {
      expect(
        checkRefundEligibility(
          facts({ latestRefundRequestStatus: RefundRequestStatus.Approved })
        )
      ).toEqual({ eligible: false, reason: "already-refunded" });
    });
  });

  it("refuses a claimed team seat", () => {
    expect(checkRefundEligibility(facts({ isClaimedTeamSeat: true }))).toEqual({
      eligible: false,
      reason: "claimed-team-seat",
    });
  });

  it("refuses once the watch limit is reached", () => {
    expect(
      checkRefundEligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS })
      )
    ).toEqual({ eligible: false, reason: "watched-too-much" });

    expect(
      checkRefundEligibility(
        facts({ secondsWatched: REFUND_WATCH_LIMIT_SECONDS - 1 })
      ).eligible
    ).toBe(true);
  });

  it("refuses once half the lessons are completed", () => {
    expect(REFUND_COMPLETION_LIMIT).toBe(0.5);

    expect(
      checkRefundEligibility(facts({ completedLessonCount: 5 }))
    ).toEqual({ eligible: false, reason: "completed-too-much" });

    expect(
      checkRefundEligibility(facts({ completedLessonCount: 4 })).eligible
    ).toBe(true);
  });

  it("ignores the completion limit for a course with no lessons", () => {
    expect(
      checkRefundEligibility(facts({ lessonCount: 0, completedLessonCount: 0 }))
        .eligible
    ).toBe(true);
  });
});
