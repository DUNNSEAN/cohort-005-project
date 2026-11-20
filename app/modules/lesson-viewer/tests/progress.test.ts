import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import { LessonProgressStatus } from "~/db/schema";
import { addLesson } from "./fixtures";

// lesson-viewer reads the app's shared `db`, so the test swaps in an
// in-memory one rather than touching data.db.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("~/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const { markLessonComplete, markLessonInProgress } = await import(
  "../progress.server"
);

const now = new Date("2026-03-01T09:30:00.000Z");

let db: TestDb;
let userId: number;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  testDb.current = db;
  const base = seedBaseData(db);
  userId = base.user.id;
  lessonId = addLesson(db, base.course.id);
});

describe("markLessonComplete", () => {
  it("completes a lesson the Student has not started, at the time given", () => {
    const progress = markLessonComplete(userId, lessonId, now);
    expect(progress.status).toBe(LessonProgressStatus.Completed);
    expect(progress.completedAt).toBe(now.toISOString());
  });

  it("completes a lesson in progress, at the time given", () => {
    markLessonInProgress(userId, lessonId);
    const progress = markLessonComplete(userId, lessonId, now);
    expect(progress.status).toBe(LessonProgressStatus.Completed);
    expect(progress.completedAt).toBe(now.toISOString());
  });
});
