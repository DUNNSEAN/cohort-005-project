import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { claimSeat, enrollStudent } from "./enrollments.server";

// Simulates a bug in the Notification code. ADR 0013: the Notification shares
// the triggering write's transaction, so the Enrollment must not be saved.
vi.mock("~/lib/notifications.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/notifications.server")>()),
  createNotifications: vi.fn(() => {
    throw new Error("Notification write failed");
  }),
}));

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
});

describe("when creating a Notification fails", () => {
  it("doesn't save the Individual Purchase's Enrollment", () => {
    expect(() =>
      testDb.transaction((tx) => {
        tx.insert(schema.purchases)
          .values({
            userId: base.user.id,
            courseId: base.course.id,
            amountPaid: 0,
          })
          .run();
        enrollStudent(tx, base.user.id, base.course.id);
      })
    ).toThrow("Notification write failed");

    expect(testDb.select().from(schema.enrollments).all()).toEqual([]);
    expect(testDb.select().from(schema.purchases).all()).toEqual([]);
  });

  it("doesn't save the Claimed Seat or its Enrollment", () => {
    const team = testDb.insert(schema.teams).values({}).returning().get();
    const purchase = testDb
      .insert(schema.purchases)
      .values({
        userId: base.instructor.id,
        courseId: base.course.id,
        amountPaid: 0,
      })
      .returning()
      .get();
    const seat = testDb
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: "SEAT-1",
        purchaseId: purchase.id,
      })
      .returning()
      .get();

    expect(() =>
      testDb.transaction((tx) => claimSeat(tx, seat.id, base.user.id))
    ).toThrow("Notification write failed");

    expect(testDb.select().from(schema.enrollments).all()).toEqual([]);
    expect(testDb.select().from(schema.coupons).all()).toEqual([
      expect.objectContaining({ redeemedByUserId: null, redeemedAt: null }),
    ]);
  });
});
