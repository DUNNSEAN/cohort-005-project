import { calculatePppPrice } from "~/lib/ppp";
import {
  countCompletedLessons,
  countLessons,
  findAllCategories,
  findEnrolledCourseIds,
  findPublishedCourses,
  summariseRatings,
  type CatalogFilters,
  type Db,
} from "./queries";

export type { CatalogFilters, Db } from "./queries";

export type CatalogViewer = {
  userId: number | null;
  country: string | null;
};

type Progress = { progress: number; completedLessons: number };

const NO_PROGRESS = { progress: null, completedLessons: null };

function percent(completed: number, total: number) {
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

type ListedCourses = { ids: number[]; lessonCounts: Map<number, number> };

function viewerProgress(
  db: Db,
  userId: number | null,
  { ids, lessonCounts }: ListedCourses
) {
  const progress = new Map<number, Progress>();
  if (userId === null) return progress;
  const enrolledIds = findEnrolledCourseIds(db, userId, ids);
  const completed = countCompletedLessons(db, userId, enrolledIds);
  for (const id of enrolledIds) {
    const completedLessons = completed.get(id) ?? 0;
    const progressPercent = percent(
      completedLessons,
      lessonCounts.get(id) ?? 0
    );
    progress.set(id, { progress: progressPercent, completedLessons });
  }
  return progress;
}

/** The published courses on the catalogue, as the viewer sees them. */
export function getCourseCatalog(
  db: Db,
  viewer: CatalogViewer,
  filters: CatalogFilters
) {
  const courses = findPublishedCourses(db, filters);
  const ids = courses.map((course) => course.id);
  const lessonCounts = countLessons(db, ids);
  const ratings = summariseRatings(db, ids);
  const progress = viewerProgress(db, viewer.userId, { ids, lessonCounts });

  return {
    courses: courses.map((course) => {
      const rating = ratings.get(course.id);
      return {
        ...course,
        lessonCount: lessonCounts.get(course.id) ?? 0,
        isEnrolled: progress.has(course.id),
        ...(progress.get(course.id) ?? NO_PROGRESS),
        pppPrice: course.pppEnabled
          ? calculatePppPrice(course.price, viewer.country)
          : course.price,
        ratingAverage: rating?.average ?? null,
        ratingCount: rating?.count ?? 0,
      };
    }),
    categories: findAllCategories(db),
  };
}
