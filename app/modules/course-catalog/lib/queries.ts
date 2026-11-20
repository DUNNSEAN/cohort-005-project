import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import * as schema from "~/db/schema";
import {
  categories,
  courseRatings,
  courses,
  CourseStatus,
  enrollments,
  lessonProgress,
  LessonProgressStatus,
  lessons,
  modules,
  users,
} from "~/db/schema";

export type Db = BetterSQLite3Database<typeof schema>;

export type CatalogFilters = {
  search: string | null;
  category: string | null;
};

const CATALOG_LIMIT = 50;

export function findPublishedCourses(db: Db, filters: CatalogFilters) {
  const conditions = [eq(courses.status, CourseStatus.Published)];
  if (filters.search) {
    const term = `%${filters.search}%`;
    const matches = or(
      like(courses.title, term),
      like(courses.description, term)
    );
    if (matches) conditions.push(matches);
  }
  if (filters.category) conditions.push(eq(categories.slug, filters.category));

  return db
    .select({
      id: courses.id,
      title: courses.title,
      slug: courses.slug,
      description: courses.description,
      instructorId: courses.instructorId,
      coverImageUrl: courses.coverImageUrl,
      price: courses.price,
      pppEnabled: courses.pppEnabled,
      instructorName: users.name,
      instructorAvatarUrl: users.avatarUrl,
      categoryName: categories.name,
    })
    .from(courses)
    .innerJoin(users, eq(courses.instructorId, users.id))
    .innerJoin(categories, eq(courses.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(sql`${courses.createdAt} DESC`)
    .limit(CATALOG_LIMIT)
    .all();
}

export function findAllCategories(db: Db) {
  return db.select().from(categories).orderBy(categories.name).all();
}

/** courseId -> number of lessons, for the given courses. */
export function countLessons(db: Db, courseIds: number[]) {
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(inArray(modules.courseId, courseIds))
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
}

/** Which of the given courses the Student has an Enrollment on. */
export function findEnrolledCourseIds(
  db: Db,
  studentId: number,
  courseIds: number[]
) {
  const rows = db
    .select({ courseId: enrollments.courseId })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, studentId),
        inArray(enrollments.courseId, courseIds)
      )
    )
    .all();
  return rows.map((row) => row.courseId);
}

/** courseId -> lessons the Student has completed, for the given courses. */
export function countCompletedLessons(
  db: Db,
  studentId: number,
  courseIds: number[]
) {
  const rows = db
    .select({ courseId: modules.courseId, count: sql<number>`count(*)` })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(lessonProgress.userId, studentId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(modules.courseId, courseIds)
      )
    )
    .groupBy(modules.courseId)
    .all();
  return new Map(rows.map((row) => [row.courseId, row.count]));
}

export type RatingSummary = { average: number; count: number };

/** courseId -> average rating (one decimal) and count, for rated courses. */
export function summariseRatings(db: Db, courseIds: number[]) {
  const rows = db
    .select({
      courseId: courseRatings.courseId,
      average: sql<number>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(inArray(courseRatings.courseId, courseIds))
    .groupBy(courseRatings.courseId)
    .all();
  return new Map<number, RatingSummary>(
    rows.map((row) => [
      row.courseId,
      {
        average: Math.round(row.average * 10) / 10,
        count: row.count,
      },
    ])
  );
}
