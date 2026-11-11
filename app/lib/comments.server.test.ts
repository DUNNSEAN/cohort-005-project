import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;
let otherLessonId: number;

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
    .values({ moduleId: mod.id, title: "Lesson 1", position: 1 })
    .returning()
    .get().id;
  otherLessonId = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Lesson 2", position: 2 })
    .returning()
    .get().id;
});

function post(
  userId: number,
  lesson: number,
  parentId: number | null,
  body: string
) {
  return testDb.transaction((tx) =>
    createComment(tx, { userId, lessonId: lesson, parentId, body })
  );
}

describe("createComment", () => {
  it("posts a top-level Comment with its body trimmed", () => {
    const comment = post(base.user.id, lessonId, null, "  Why use generics?  ");

    expect(comment).toMatchObject({
      userId: base.user.id,
      lessonId,
      parentId: null,
      body: "Why use generics?",
      deletedAt: null,
    });
  });

  it("posts a Discussion Reply under a top-level Comment", () => {
    const question = post(base.user.id, lessonId, null, "Why use generics?");

    const reply = post(
      base.instructor.id,
      lessonId,
      question.id,
      "To keep types precise."
    );

    expect(reply).toMatchObject({
      userId: base.instructor.id,
      lessonId,
      parentId: question.id,
      body: "To keep types precise.",
    });
  });

  it("rejects an empty body", () => {
    expect(() => post(base.user.id, lessonId, null, "   ")).toThrow(
      "Comment cannot be empty"
    );
  });

  it("rejects a body over 5000 characters", () => {
    expect(() => post(base.user.id, lessonId, null, "a".repeat(5001))).toThrow(
      "Comment must be 5000 characters or fewer"
    );
  });

  it("rejects a Comment on a lesson that doesn't exist", () => {
    expect(() => post(base.user.id, 9999, null, "Hello")).toThrow(
      "Lesson not found"
    );
  });

  it("rejects a reply to a Comment that doesn't exist", () => {
    expect(() => post(base.user.id, lessonId, 9999, "Hello")).toThrow(
      "Parent comment not found"
    );
  });

  it("rejects a reply to a Comment on a different lesson", () => {
    const elsewhere = post(base.user.id, otherLessonId, null, "Elsewhere");

    expect(() => post(base.user.id, lessonId, elsewhere.id, "Hello")).toThrow(
      "Parent comment belongs to a different lesson"
    );
  });

  it("rejects a reply to a reply", () => {
    const question = post(base.user.id, lessonId, null, "Question");
    const reply = post(base.instructor.id, lessonId, question.id, "Answer");

    expect(() => post(base.user.id, lessonId, reply.id, "Nested")).toThrow(
      "Replies can only be one level deep"
    );
  });
});
