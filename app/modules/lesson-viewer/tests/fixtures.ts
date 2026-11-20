import * as schema from "~/db/schema";
import type { TestDb } from "~/test/setup";

// No module writes modules or lessons yet (the instructor routes do it
// inline), so rows go in directly. Kept in one place so a schema change
// touches only this.
export function addLesson(db: TestDb, courseId: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Basics", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "What is REST?", position: 1 })
    .returning()
    .get().id;
}
