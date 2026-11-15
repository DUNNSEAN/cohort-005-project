import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import {
  getInstructorAnalytics,
  type AnalyticsQuery,
} from "./instructor-analytics.server";

// Deliberately nowhere near the real date, so anything still reading the
// clock lands in the wrong window and shows up.
const NOW = new Date("2026-06-15T12:00:00.000Z");

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function asInstructor(overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
  return {
    viewer: { userId: base.instructor.id, isAdmin: false },
    range: "7d",
    requestedInstructorId: null,
    requestedCourseId: null,
    ...overrides,
  };
}

function purchase(createdAt: string, amountPaid = 10000) {
  db.insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid,
      createdAt,
    })
    .run();
}

describe("the range", () => {
  it("counts purchases from the last seven days before now, and no older", () => {
    purchase("2026-06-12T09:00:00.000Z", 5000);
    purchase("2026-06-01T09:00:00.000Z", 9900);

    const analytics = getInstructorAnalytics(db, asInstructor(), NOW);

    expect(analytics.summary).toEqual({
      grossCents: 5000,
      feeCents: 1000,
      netCents: 4000,
      purchaseCount: 1,
    });
  });
});

describe("revenue over time", () => {
  it("draws one bar per day of the week, ending on today", () => {
    purchase("2026-06-12T09:00:00.000Z", 5000);

    const { series } = getInstructorAnalytics(db, asInstructor(), NOW);

    expect(series.points.map((point) => point.bucket)).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
  });
});

describe("refund exposure", () => {
  it("counts a five-day-old purchase as at risk, with nine days left", () => {
    purchase("2026-06-10T12:00:00.000Z", 5000);

    const { refundExposure } = getInstructorAnalytics(db, asInstructor(), NOW);

    expect(refundExposure).toMatchObject({
      grossCents: 5000,
      purchaseCount: 1,
      closingTodayCount: 0,
      courses: [{ title: "Test Course", grossCents: 5000, daysLeft: 9 }],
    });
  });

  it("closes at the end of the fourteenth UTC day, whatever the server's timezone", () => {
    purchase("2026-06-01T12:00:00.000Z", 5000);

    for (const now of [
      new Date("2026-06-15T02:00:00.000Z"),
      new Date("2026-06-15T23:00:00.000Z"),
    ]) {
      const query = asInstructor({ range: "30d" });
      const { refundExposure } = getInstructorAnalytics(db, query, now);

      expect(refundExposure.closingTodayCount).toBe(1);
    }
  });
});

describe("who sees what", () => {
  function otherInstructorsCourse() {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Instructor",
        email: "other@example.com",
        role: schema.UserRole.Instructor,
      })
      .returning()
      .get();

    const course = db
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Someone else's course",
        salesCopy: markdown("## Other Course"),
        instructorId: other.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();

    db.insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: course.id,
        amountPaid: 7700,
        createdAt: "2026-06-12T09:00:00.000Z",
      })
      .run();

    return { instructorId: other.id, courseId: course.id };
  }

  it("keeps an instructor on their own figures, whoever they ask for", () => {
    const other = otherInstructorsCourse();
    purchase("2026-06-12T09:00:00.000Z", 5000);

    const analytics = getInstructorAnalytics(
      db,
      asInstructor({ requestedInstructorId: other.instructorId }),
      NOW
    );

    expect(analytics.instructorId).toBe(base.instructor.id);
    expect(analytics.summary.grossCents).toBe(5000);
  });

  it("won't open another instructor's course for an instructor", () => {
    const other = otherInstructorsCourse();

    const analytics = getInstructorAnalytics(
      db,
      asInstructor({ requestedCourseId: other.courseId }),
      NOW
    );

    expect(analytics.selectedCourseId).toBeNull();
    expect(analytics.funnel).toBeNull();
  });

  it("lets an admin look at any one instructor", () => {
    const other = otherInstructorsCourse();
    purchase("2026-06-12T09:00:00.000Z", 5000);

    const analytics = getInstructorAnalytics(
      db,
      asInstructor({
        viewer: { userId: base.user.id, isAdmin: true },
        requestedInstructorId: other.instructorId,
      }),
      NOW
    );

    expect(analytics.summary.grossCents).toBe(7700);
  });
});
