import type { Route } from "../../routes/+types/courses.$slug.lessons.$lessonId";

/** What the Lesson page loader returns, for the page components. */
export type LessonLoaderData = Route.ComponentProps["loaderData"];
