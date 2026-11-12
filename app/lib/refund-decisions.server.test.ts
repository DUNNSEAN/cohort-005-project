import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as schema from "~/db/schema";
import { RefundRequestStatus, UserRole } from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  approveRefundRequest,
  declineRefundRequest,
  getSeatFreeze,
  listOpenRefundRequests,
} from "./refund-decisions.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 0, 5, 12, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let platformAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  platformAdmin = db
    .insert(schema.users)
    .values({
      name: "Platform Admin",
      email: "admin@example.com",
      role: UserRole.Admin,
    })
    .returning()
    .get();
});

/** The buyer bought the course for themselves and is enrolled through it. */
function individualPurchaseWithOpenRequest(amountPaid = 7900) {
  const purchase = db
    .insert(schema.purchases)
    .values({ userId: base.user.id, courseId: base.course.id, amountPaid })
    .returning()
    .get();
  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  const refundRequest = db
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Not what I expected." })
    .returning()
    .get();
  return { purchase, refundRequest };
}

function getRefundRequest(id: number) {
  return db
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, id))
    .get();
}

function isEnrolled(userId: number, courseId: number) {
  return Boolean(
    db
      .select()
      .from(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, userId),
          eq(schema.enrollments.courseId, courseId)
        )
      )
      .get()
  );
}

describe("declineRefundRequest", () => {
  it("records the Platform Admin's reason and leaves the buyer enrolled", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest();

    const result = db.transaction((tx) =>
      declineRefundRequest(
        tx,
        refundRequest.id,
        platformAdmin.id,
        "You have watched most of it.",
        NOW
      )
    );

    expect(result.ok).toBe(true);
    expect(getRefundRequest(refundRequest.id)).toMatchObject({
      status: RefundRequestStatus.Declined,
      declineReason: "You have watched most of it.",
      amountRefunded: null,
      resolvedAt: NOW.toISOString(),
      resolvedByUserId: platformAdmin.id,
    });
    expect(isEnrolled(base.user.id, base.course.id)).toBe(true);
  });

  it("needs a reason, because the buyer is shown it", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest();

    const result = db.transaction((tx) =>
      declineRefundRequest(tx, refundRequest.id, platformAdmin.id, "   ", NOW)
    );

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(getRefundRequest(refundRequest.id)?.status).toBe(
      RefundRequestStatus.Open
    );
  });

  it("refuses a Refund Request that has already been decided", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest();
    db.transaction((tx) =>
      declineRefundRequest(tx, refundRequest.id, platformAdmin.id, "No.", NOW)
    );

    const second = db.transaction((tx) =>
      declineRefundRequest(tx, refundRequest.id, platformAdmin.id, "Again.", NOW)
    );

    expect(second).toMatchObject({ ok: false, status: 409 });
    expect(getRefundRequest(refundRequest.id)?.declineReason).toBe("No.");
  });

  it("lets the buyer raise a new Refund Request on the Purchase, but only one Open at once", () => {
    const { purchase, refundRequest } = individualPurchaseWithOpenRequest();
    const raise = () =>
      db
        .insert(schema.refundRequests)
        .values({ purchaseId: purchase.id, reason: "Asking again." })
        .run();

    expect(raise).toThrow(/UNIQUE/);

    db.transaction((tx) =>
      declineRefundRequest(tx, refundRequest.id, platformAdmin.id, "No.", NOW)
    );

    expect(raise).not.toThrow();
  });
});

/** A Team Licence the buyer bought, with its Seats and an Open Refund Request. */
function teamLicenceWithOpenRequest(seatCount = 3, amountPaid = 23700) {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({ userId: base.user.id, courseId: base.course.id, amountPaid })
    .returning()
    .get();
  const seats = Array.from({ length: seatCount }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  const refundRequest = db
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Bought the wrong course." })
    .returning()
    .get();
  return { purchase, seats, refundRequest };
}

function addStudent(email: string) {
  return db
    .insert(schema.users)
    .values({ name: email, email, role: UserRole.Student })
    .returning()
    .get();
}

function claimSeat(couponId: number, userId: number) {
  db.update(schema.coupons)
    .set({ redeemedByUserId: userId, redeemedAt: NOW.toISOString() })
    .where(eq(schema.coupons.id, couponId))
    .run();
}

/** Everything a Student leaves behind by taking the course. */
function seedLearning(userId: number) {
  const courseModule = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();
  const lesson = db
    .insert(schema.lessons)
    .values({ moduleId: courseModule.id, title: "Hello", position: 1 })
    .returning()
    .get();
  const quiz = db
    .insert(schema.quizzes)
    .values({ lessonId: lesson.id, title: "Check", passingScore: 0.5 })
    .returning()
    .get();

  db.insert(schema.lessonProgress)
    .values({
      userId,
      lessonId: lesson.id,
      status: schema.LessonProgressStatus.Completed,
    })
    .run();
  db.insert(schema.videoWatchEvents)
    .values({ userId, lessonId: lesson.id, eventType: "pause", positionSeconds: 90 })
    .run();
  db.insert(schema.quizAttempts)
    .values({ userId, quizId: quiz.id, score: 1, passed: true })
    .run();
  db.insert(schema.comments)
    .values({ userId, lessonId: lesson.id, body: "Great lesson." })
    .run();
  db.insert(schema.courseRatings)
    .values({ userId, courseId: base.course.id, rating: 4 })
    .run();

  return learningOf(userId);
}

function learningOf(userId: number) {
  return {
    progress: db
      .select()
      .from(schema.lessonProgress)
      .where(eq(schema.lessonProgress.userId, userId))
      .all(),
    watchHistory: db
      .select()
      .from(schema.videoWatchEvents)
      .where(eq(schema.videoWatchEvents.userId, userId))
      .all(),
    quizAttempts: db
      .select()
      .from(schema.quizAttempts)
      .where(eq(schema.quizAttempts.userId, userId))
      .all(),
    comments: db
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.userId, userId))
      .all(),
    ratings: db
      .select()
      .from(schema.courseRatings)
      .where(eq(schema.courseRatings.userId, userId))
      .all(),
  };
}

describe("approveRefundRequest", () => {
  it("ends the buyer's Enrollment and records a Pending Refund of the full amount paid", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest(7900);

    const result = db.transaction((tx) =>
      approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
    );

    expect(result.ok).toBe(true);
    expect(getRefundRequest(refundRequest.id)).toMatchObject({
      status: RefundRequestStatus.Approved,
      amountRefunded: 7900,
      declineReason: null,
      resolvedAt: NOW.toISOString(),
      resolvedByUserId: platformAdmin.id,
    });
    expect(isEnrolled(base.user.id, base.course.id)).toBe(false);
  });

  it("keeps the buyer's progress, watch history, quiz attempts, Comments and rating", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest();
    const learning = seedLearning(base.user.id);

    db.transaction((tx) =>
      approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
    );

    expect(learningOf(base.user.id)).toEqual(learning);
  });

  it("leaves the Enrollment alone when the buyer also holds a Claimed Seat for the course", () => {
    const { refundRequest } = individualPurchaseWithOpenRequest();
    const colleague = addStudent("colleague@example.com");
    const team = db.insert(schema.teams).values({}).returning().get();
    const teamLicence = db
      .insert(schema.purchases)
      .values({ userId: colleague.id, courseId: base.course.id, amountPaid: 7900 })
      .returning()
      .get();
    const seat = db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "COLLEAGUE-SEAT",
        purchaseId: teamLicence.id,
      })
      .returning()
      .get();
    claimSeat(seat.id, base.user.id);

    const result = db.transaction((tx) =>
      approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
    );

    expect(result.ok).toBe(true);
    expect(isEnrolled(base.user.id, base.course.id)).toBe(true);
  });

  describe("on a Team Licence", () => {
    it("is refused once any Seat has been claimed", () => {
      const { seats, refundRequest } = teamLicenceWithOpenRequest();
      const student = addStudent("student@example.com");
      claimSeat(seats[0].id, student.id);
      db.insert(schema.enrollments)
        .values({ userId: student.id, courseId: base.course.id })
        .run();

      const result = db.transaction((tx) =>
        approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
      );

      expect(result).toMatchObject({ ok: false, status: 409 });
      expect(getRefundRequest(refundRequest.id)?.status).toBe(
        RefundRequestStatus.Open
      );
      expect(isEnrolled(student.id, base.course.id)).toBe(true);
    });

    it("records a Pending Refund of the full amount when no Seat is claimed", () => {
      const { refundRequest } = teamLicenceWithOpenRequest(3, 23700);

      const result = db.transaction((tx) =>
        approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
      );

      expect(result.ok).toBe(true);
      expect(getRefundRequest(refundRequest.id)).toMatchObject({
        status: RefundRequestStatus.Approved,
        amountRefunded: 23700,
      });
    });
  });
});

describe("whether a Team Licence's Unclaimed Seats can be claimed", () => {
  it("they can while it has no Refund Request", () => {
    const { purchase, refundRequest } = teamLicenceWithOpenRequest();
    db.delete(schema.refundRequests)
      .where(eq(schema.refundRequests.id, refundRequest.id))
      .run();

    expect(getSeatFreeze(db, purchase.id)).toBeNull();
  });

  it("they can't while a Refund Request is Open", () => {
    const { purchase } = teamLicenceWithOpenRequest();

    expect(getSeatFreeze(db, purchase.id)).toBe("refund-request-open");
  });

  it("they can again once it is declined", () => {
    const { purchase, refundRequest } = teamLicenceWithOpenRequest();
    db.transaction((tx) =>
      declineRefundRequest(tx, refundRequest.id, platformAdmin.id, "No.", NOW)
    );

    expect(getSeatFreeze(db, purchase.id)).toBeNull();
  });

  it("they never can once it is approved", () => {
    const { purchase, refundRequest } = teamLicenceWithOpenRequest();
    db.transaction((tx) =>
      approveRefundRequest(tx, refundRequest.id, platformAdmin.id, NOW)
    );

    expect(getSeatFreeze(db, purchase.id)).toBe("refunded");
  });
});

describe("listOpenRefundRequests", () => {
  it("lists only Open Refund Requests, oldest first, with what a Platform Admin decides on", () => {
    const individual = individualPurchaseWithOpenRequest(7900);
    const teamLicence = teamLicenceWithOpenRequest(2, 15800);
    const student = addStudent("student@example.com");
    claimSeat(teamLicence.seats[0].id, student.id);
    const decided = individualPurchaseWithOpenRequest(5000);
    db.transaction((tx) =>
      declineRefundRequest(
        tx,
        decided.refundRequest.id,
        platformAdmin.id,
        "No.",
        NOW
      )
    );

    expect(listOpenRefundRequests(db)).toMatchObject([
      {
        id: individual.refundRequest.id,
        reason: "Not what I expected.",
        buyerName: "Test User",
        courseTitle: "Test Course",
        amountPaid: 7900,
        purchase: { kind: "individual-purchase" },
        canApprove: true,
      },
      {
        id: teamLicence.refundRequest.id,
        amountPaid: 15800,
        purchase: { kind: "team-licence", seatCount: 2, claimedSeatCount: 1 },
        canApprove: false,
      },
    ]);
  });
});
