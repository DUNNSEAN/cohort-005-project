import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { enrollStudent } from "./enrollments.server";

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
          .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 0 })
          .run();
        enrollStudent(tx, base.user.id, base.course.id);
      })
    ).toThrow("Notification write failed");

    expect(testDb.select().from(schema.enrollments).all()).toEqual([]);
    expect(testDb.select().from(schema.purchases).all()).toEqual([]);
  });
});
