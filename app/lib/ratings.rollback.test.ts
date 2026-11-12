import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { rateCourse } from "./ratings.server";

// Simulates a bug in the Notification code. ADR 0013: the Notification shares
// the triggering write's transaction, so the rating must not be saved.
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
  it("doesn't save the first rating that triggered it", () => {
    expect(() =>
      testDb.transaction((tx) =>
        rateCourse(tx, base.user.id, base.course.id, 4)
      )
    ).toThrow("Notification write failed");

    expect(testDb.select().from(schema.courseRatings).all()).toEqual([]);
  });
});
