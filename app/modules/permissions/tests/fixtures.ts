import { expect } from "vitest";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { markdown } from "~/lib/text";
import type { TestDb } from "~/test/setup";

const URL = "http://cadence.test/";

/** A request from someone signed in, with a real session cookie. */
export async function signedInRequest(
  userId: number,
  { country }: { country?: string } = {}
): Promise<Request> {
  const setCookie = await setCurrentUserId(new Request(URL), userId);
  const headers = new Headers({ Cookie: setCookie.split(";")[0] });
  if (country) headers.set("CF-IPCountry", country);
  return new Request(URL, { headers });
}

export function signedOutRequest(): Request {
  return new Request(URL);
}

/** The response a `require…` function threw. Fails if it resolved. */
export async function rejection(
  promise: Promise<unknown>
): Promise<{ status: number; message: unknown }> {
  try {
    await promise;
  } catch (thrown) {
    const response = thrown as { data: unknown; init: { status: number } };
    return { status: response.init.status, message: response.data };
  }
  expect.fail("expected the call to throw a response");
}

export function addUser(db: TestDb, name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
      role,
    })
    .returning()
    .get();
}

export function addCourse(
  db: TestDb,
  instructorId: number,
  categoryId: number,
  overrides: Partial<typeof schema.courses.$inferInsert> = {}
) {
  const title = overrides.title ?? `Course ${Math.random().toString(36).slice(2, 8)}`;
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      description: "A course",
      salesCopy: markdown("Sales copy."),
      instructorId,
      categoryId,
      status: schema.CourseStatus.Published,
      ...overrides,
    })
    .returning()
    .get();
}

export function addLesson(db: TestDb, courseId: number) {
  const module = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  return db
    .insert(schema.lessons)
    .values({ moduleId: module.id, title: "Lesson", position: 1 })
    .returning()
    .get();
}

/** An Individual Purchase and the Enrollment it gives. */
export function enroll(
  db: TestDb,
  userId: number,
  courseId: number,
  { purchaseCountry }: { purchaseCountry?: string | null } = {}
) {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
  db.insert(schema.purchases)
    .values({
      userId,
      courseId,
      amountPaid: 2500,
      country: purchaseCountry ?? null,
    })
    .run();
}
