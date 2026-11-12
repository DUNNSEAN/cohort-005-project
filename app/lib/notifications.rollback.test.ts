import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";

// Simulates a bug in the Notification code. ADR 0013: the Notification shares
// the triggering write's transaction, so the event must not be saved.
vi.mock("~/lib/notifications.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/notifications.server")>()),
  createNotifications: vi.fn(() => {
    throw new Error("Notification write failed");
  }),
}));

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Generics", position: 1 })
    .returning()
    .get().id;
});

describe("when creating a Notification fails", () => {
  it("doesn't save the Discussion Reply that triggered it", () => {
    const question = testDb
      .insert(schema.comments)
      .values({ userId: base.user.id, lessonId, body: "Why use generics?" })
      .returning()
      .get();

    expect(() =>
      testDb.transaction((tx) =>
        createComment(tx, {
          userId: base.instructor.id,
          lessonId,
          parentId: question.id,
          body: "To keep types precise.",
        })
      )
    ).toThrow("Notification write failed");

    expect(testDb.select().from(schema.comments).all()).toEqual([
      expect.objectContaining({ id: question.id }),
    ]);
  });
});
