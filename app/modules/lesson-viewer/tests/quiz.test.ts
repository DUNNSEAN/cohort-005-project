import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { addLesson } from "./fixtures";

// lesson-viewer reads the app's shared `db`, so the test swaps in an
// in-memory one rather than touching data.db.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("~/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const { getQuizById, getQuizByLessonId } = await import("../quiz.server");

let db: TestDb;
let lessonId: number;

beforeEach(() => {
  db = createTestDb();
  testDb.current = db;
  lessonId = addLesson(db, seedBaseData(db).course.id);
});

// ─── Fixtures ───
// No module writes quizzes yet (the instructor quiz route does it inline), so
// rows go in directly.

function addQuiz(title: string) {
  return db
    .insert(schema.quizzes)
    .values({ lessonId, title, passingScore: 0.7 })
    .returning()
    .get();
}

describe("getQuizById", () => {
  it("returns the quiz with that id", () => {
    addQuiz("Warm-up");
    const quiz = addQuiz("REST check");
    expect(getQuizById(quiz.id)).toEqual(quiz);
  });

  it("returns undefined for an unknown id", () => {
    expect(getQuizById(999)).toBeUndefined();
  });
});

describe("getQuizByLessonId", () => {
  it("returns the quiz attached to the lesson", () => {
    const quiz = addQuiz("REST check");
    expect(getQuizByLessonId(lessonId)).toEqual(quiz);
  });
});
