import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { rateCourse } from "./ratings.server";
import {
  countUnreadNotifications,
  listNotifications,
} from "./notifications.server";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  testDb
    .insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
});

function rate(userId: number, rating: number) {
  return testDb.transaction((tx) =>
    rateCourse(tx, userId, base.course.id, rating)
  );
}

describe("first_rating", () => {
  it("tells the Instructor when a Student first rates their course", () => {
    rate(base.user.id, 4);

    expect(listNotifications(testDb, base.instructor.id)).toEqual([
      expect.objectContaining({
        kind: schema.NotificationKind.FirstRating,
        actorName: "Test User",
        action: "rated your course ★★★★☆",
        quote: null,
        courseTitle: "Test Course",
        lessonTitle: null,
        href: "/courses/test-course",
        read: false,
      }),
    ]);
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(1);
  });

  it("words a later Student's first rating the same way, not as the course's first", () => {
    rate(base.user.id, 4);
    const [second] = testDb
      .insert(schema.users)
      .values({
        name: "Priya Shah",
        email: "priya@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .all();
    testDb
      .insert(schema.enrollments)
      .values({ userId: second.id, courseId: base.course.id })
      .run();

    rate(second.id, 2);

    expect(
      listNotifications(testDb, base.instructor.id).map((item) => [
        item.actorName,
        item.action,
      ])
    ).toEqual([
      ["Priya Shah", "rated your course ★★☆☆☆"],
      ["Test User", "rated your course ★★★★☆"],
    ]);
  });

  it("notifies nobody when the Student changes their rating", () => {
    rate(base.user.id, 4);

    rate(base.user.id, 2);

    expect(listNotifications(testDb, base.instructor.id)).toHaveLength(1);
    expect(listNotifications(testDb, base.user.id)).toEqual([]);
  });

  it("notifies nobody of the Instructor rating their own course", () => {
    rate(base.instructor.id, 5);

    expect(listNotifications(testDb, base.instructor.id)).toEqual([]);
  });
});

describe("rating a course", () => {
  it("records a first rating as new and a changed one as not", () => {
    expect(rate(base.user.id, 4)).toEqual(
      expect.objectContaining({ rating: 4, isFirstRating: true })
    );
    expect(rate(base.user.id, 2)).toEqual(
      expect.objectContaining({ rating: 2, isFirstRating: false })
    );
  });

  it("rejects a rating outside 1–5", () => {
    expect(() => rate(base.user.id, 6)).toThrow(
      "Rating must be a whole number between 1 and 5"
    );
    expect(listNotifications(testDb, base.instructor.id)).toEqual([]);
  });
});
