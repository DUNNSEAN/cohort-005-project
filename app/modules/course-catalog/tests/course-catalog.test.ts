import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { enrollStudentInTransaction } from "~/lib/enrollments.server";
import { markdown } from "~/lib/text";
import { createCourseCatalog } from "../index.server";

// Lesson progress is written by lesson-viewer, which reads the app's shared
// `db`, so the test swaps in its in-memory one.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("~/db", () => ({
  get db() {
    return testDb.current;
  },
}));

const { markLessonComplete, markLessonInProgress } = await import(
  "~/modules/lesson-viewer/progress.server"
);

const NOW = new Date("2026-11-20T12:00:00.000Z");
const ANYWHERE = { search: null, category: null };

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let catalog: ReturnType<typeof createCourseCatalog>;

beforeEach(() => {
  db = createTestDb();
  testDb.current = db;
  base = seedBaseData(db);
  catalog = createCourseCatalog(db);
});

// ─── Fixtures ───
// Course content and ratings have no service that writes them, so rows go in
// directly. Kept in one place so a schema change touches only this block.
// Enrollments and progress go through the code that owns them.

function addLessons(courseId: number, count: number) {
  const module = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  return Array.from({ length: count }, (_, i) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: `Lesson ${i}`, position: i + 1 })
      .returning()
      .get()
  );
}

function complete(userId: number, lessonId: number) {
  markLessonComplete(userId, lessonId, NOW);
}

function rate(courseId: number, ratings: number[]) {
  for (const [i, rating] of ratings.entries()) {
    const rater = db
      .insert(schema.users)
      .values({
        name: `Rater ${i}`,
        email: `rater${i}@example.com`,
        role: UserRole.Student,
      })
      .returning()
      .get();
    db.insert(schema.courseRatings)
      .values({ userId: rater.id, courseId, rating })
      .run();
  }
}

function addCourse(title: string, status = CourseStatus.Published) {
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replaceAll(" ", "-"),
      description: title,
      salesCopy: markdown(title),
      instructorId: base.instructor.id,
      categoryId: base.category.id,
      status,
      price: 10000,
      pppEnabled: true,
    })
    .returning()
    .get();
}

function enrol(userId: number, courseId: number) {
  const result = enrollStudentInTransaction(db, userId, courseId, NOW);
  if (!result.ok) throw new Error(result.error);
}

function asStudent() {
  return { userId: base.user.id, country: null };
}

function findCourse(
  courses: ReturnType<typeof catalog.list>["courses"],
  courseId: number
) {
  const course = courses.find((c) => c.id === courseId);
  if (!course) throw new Error(`course ${courseId} not in catalogue`);
  return course;
}

describe("the Enrolled flag", () => {
  it("marks a course the Student is enrolled on, even at 0% progress", () => {
    addLessons(base.course.id, 4);
    enrol(base.user.id, base.course.id);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({
      isEnrolled: true,
      progress: 0,
      completedLessons: 0,
      lessonCount: 4,
    });
  });

  it("leaves a course the Student is not enrolled on unmarked", () => {
    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({
      isEnrolled: false,
      progress: null,
      completedLessons: null,
    });
  });

  it("does not mark another Student's Enrollment", () => {
    enrol(base.instructor.id, base.course.id);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course.isEnrolled).toBe(false);
  });

  it("marks nothing for a visitor who is not signed in", () => {
    enrol(base.user.id, base.course.id);

    const { courses } = catalog.list({ userId: null, country: null }, ANYWHERE);

    expect(courses.map((c) => c.isEnrolled)).toEqual([false]);
  });

  it("does not mark a Lapsed Student, who has progress but no Enrollment", () => {
    const [lesson] = addLessons(base.course.id, 2);
    complete(base.user.id, lesson.id);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({ isEnrolled: false, progress: null });
  });
});

describe("progress on an enrolled course", () => {
  it("counts completed lessons on that course only", () => {
    const lessons = addLessons(base.course.id, 3);
    const other = addCourse("Other Course");
    const [otherLesson] = addLessons(other.id, 1);
    enrol(base.user.id, base.course.id);
    complete(base.user.id, lessons[0].id);
    complete(base.user.id, otherLesson.id);
    markLessonInProgress(base.user.id, lessons[1].id);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({ completedLessons: 1, progress: 33 });
  });

  it("is 0% on an enrolled course with no lessons", () => {
    enrol(base.user.id, base.course.id);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({ isEnrolled: true, progress: 0 });
  });
});

describe("which courses are listed", () => {
  it("lists published courses only, newest first", () => {
    addCourse("Draft Course", CourseStatus.Draft);
    const newer = addCourse("Newer Course");
    db.update(schema.courses)
      .set({ createdAt: "2099-01-01T00:00:00.000Z" })
      .run();
    db.update(schema.courses)
      .set({ createdAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    const { courses } = catalog.list(asStudent(), ANYWHERE);

    expect(courses.map((c) => c.id)).toEqual([newer.id, base.course.id]);
  });

  it("filters by a search term in the title or description", () => {
    addCourse("Rust Basics");

    const { courses } = catalog.list(asStudent(), {
      search: "rust",
      category: null,
    });

    expect(courses.map((c) => c.title)).toEqual(["Rust Basics"]);
  });

  it("filters by category slug, and returns every category", () => {
    const { courses, categories } = catalog.list(asStudent(), {
      search: null,
      category: "no-such-category",
    });

    expect(courses).toEqual([]);
    expect(categories.map((c) => c.slug)).toEqual([base.category.slug]);
  });
});

describe("price and rating", () => {
  it("discounts a PPP course for the viewer's country", () => {
    const course = addCourse("Priced Course");

    const listed = findCourse(
      catalog.list({ userId: null, country: "IN" }, ANYWHERE).courses,
      course.id
    );

    expect(listed.price).toBe(10000);
    expect(listed.pppPrice).toBeLessThan(10000);
  });

  it("averages ratings to one decimal place", () => {
    rate(base.course.id, [5, 4, 4]);

    const course = findCourse(
      catalog.list(asStudent(), ANYWHERE).courses,
      base.course.id
    );

    expect(course).toMatchObject({ ratingAverage: 4.3, ratingCount: 3 });
  });
});
