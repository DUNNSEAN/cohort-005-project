import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent } from "./enrollments.server";
import {
  countUnreadNotifications,
  listNotifications,
} from "./notifications.server";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
});

/** An Individual Purchase, as the purchase page records it. */
function buyForSelf(userId: number) {
  return testDb.transaction((tx) => {
    tx.insert(schema.purchases)
      .values({ userId, courseId: base.course.id, amountPaid: 0 })
      .run();
    return enrollStudent(tx, userId, base.course.id);
  });
}

describe("enrollment", () => {
  it("tells the Instructor when a Student makes an Individual Purchase", () => {
    buyForSelf(base.user.id);

    expect(listNotifications(testDb, base.instructor.id)).toEqual([
      expect.objectContaining({
        kind: schema.NotificationKind.Enrollment,
        actorName: "Test User",
        action: "enrolled in Test Course",
        quote: null,
        courseTitle: "Test Course",
        lessonTitle: null,
        href: `/instructor/${base.course.id}/students`,
        read: false,
      }),
    ]);
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(1);
  });

  it("tells the Instructor once when a Student claims a Seat", () => {
    const buyer = addStudent("Team Buyer");
    const code = buySeat(buyer.id);
    const learner = addStudent("Seat Holder");

    claimSeat(code, learner.id);

    expect(listNotifications(testDb, base.instructor.id)).toEqual([
      expect.objectContaining({
        kind: schema.NotificationKind.Enrollment,
        actorName: "Seat Holder",
        action: "enrolled in Test Course",
        href: `/instructor/${base.course.id}/students`,
      }),
    ]);
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(1);
  });

  it("notifies no one when the Instructor enrols in their own course", () => {
    buyForSelf(base.instructor.id);

    expect(listNotifications(testDb, base.instructor.id)).toEqual([]);
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(0);
  });

  it("doesn't notify the Student who enrolled", () => {
    buyForSelf(base.user.id);

    expect(listNotifications(testDb, base.user.id)).toEqual([]);
  });

  it("refuses a second Enrollment on the same course", () => {
    buyForSelf(base.user.id);

    expect(() =>
      testDb.transaction((tx) =>
        enrollStudent(tx, base.user.id, base.course.id)
      )
    ).toThrow("You are already enrolled in this course");
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(1);
  });
});

function addStudent(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

/** A Team Licence with one Seat; returns the Seat's code. */
function buySeat(buyerId: number) {
  const team = testDb.insert(schema.teams).values({}).returning().get();
  const purchase = testDb
    .insert(schema.purchases)
    .values({ userId: buyerId, courseId: base.course.id, amountPaid: 0 })
    .returning()
    .get();
  return testDb
    .insert(schema.coupons)
    .values({
      teamId: team.id,
      courseId: base.course.id,
      code: "SEAT-1",
      purchaseId: purchase.id,
    })
    .returning()
    .get().code;
}

/** A Claimed Seat, as the redeem page records it. */
function claimSeat(code: string, userId: number) {
  return testDb.transaction((tx) => {
    tx.update(schema.coupons)
      .set({ redeemedByUserId: userId, redeemedAt: new Date().toISOString() })
      .where(eq(schema.coupons.code, code))
      .run();
    return enrollStudent(tx, userId, base.course.id);
  });
}
