import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { createPermissions, type Permissions } from "../index.server";
import {
  addUser,
  rejection,
  signedInRequest,
  signedOutRequest,
} from "./fixtures";

const SIGNED_OUT = "Select a user from the DevUI panel.";

let db: TestDb;
let permissions: Permissions;
let student: typeof schema.users.$inferSelect;
let instructor: typeof schema.users.$inferSelect;
let platformAdmin: typeof schema.users.$inferSelect;
let course: typeof schema.courses.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  const base = seedBaseData(db);
  student = base.user;
  instructor = base.instructor;
  course = base.course;
  platformAdmin = addUser(db, "Pat Admin", UserRole.Admin);
  permissions = createPermissions(db);
});

describe("requireSignedIn", () => {
  it("rejects a signed-out request with 401", async () => {
    expect(
      await rejection(permissions.requireSignedIn(signedOutRequest()))
    ).toEqual({ status: 401, message: SIGNED_OUT });
  });

  it("treats a session for a user who no longer exists as signed out", async () => {
    expect(
      await rejection(permissions.requireSignedIn(await signedInRequest(9999)))
    ).toEqual({ status: 401, message: SIGNED_OUT });
  });

  it("returns the Viewer for anyone signed in", async () => {
    expect(
      await permissions.requireSignedIn(await signedInRequest(student.id))
    ).toEqual({ userId: student.id, isPlatformAdmin: false });
    expect(
      await permissions.requireSignedIn(await signedInRequest(platformAdmin.id))
    ).toEqual({ userId: platformAdmin.id, isPlatformAdmin: true });
  });
});

describe("requirePlatformAdmin", () => {
  it("rejects a signed-out request with 401", async () => {
    expect(
      (await rejection(permissions.requirePlatformAdmin(signedOutRequest())))
        .status
    ).toBe(401);
  });

  it.each([
    ["a Student", () => student],
    ["an Instructor", () => instructor],
  ])("rejects %s with 403", async (_, who) => {
    expect(
      await rejection(
        permissions.requirePlatformAdmin(await signedInRequest(who().id))
      )
    ).toEqual({ status: 403, message: "Only Platform Admins can do that." });
  });

  it("lets a Platform Admin in", async () => {
    expect(
      await permissions.requirePlatformAdmin(
        await signedInRequest(platformAdmin.id)
      )
    ).toEqual({ userId: platformAdmin.id, isPlatformAdmin: true });
  });
});

describe("requireInstructor", () => {
  it("rejects a signed-out request with 401", async () => {
    expect(
      (await rejection(permissions.requireInstructor(signedOutRequest())))
        .status
    ).toBe(401);
  });

  it("rejects a Student with 403", async () => {
    expect(
      await rejection(
        permissions.requireInstructor(await signedInRequest(student.id))
      )
    ).toEqual({ status: 403, message: "Only Instructors can do that." });
  });

  it("lets an Instructor and a Platform Admin in", async () => {
    expect(
      await permissions.requireInstructor(await signedInRequest(instructor.id))
    ).toEqual({ userId: instructor.id, isPlatformAdmin: false });
    expect(
      await permissions.requireInstructor(
        await signedInRequest(platformAdmin.id)
      )
    ).toEqual({ userId: platformAdmin.id, isPlatformAdmin: true });
  });
});

describe("requireCanCreateCourse", () => {
  it("rejects a signed-out request with 401", async () => {
    expect(
      (await rejection(permissions.requireCanCreateCourse(signedOutRequest())))
        .status
    ).toBe(401);
  });

  it.each([
    ["a Student", () => student],
    ["a Platform Admin", () => platformAdmin],
  ])("rejects %s with 403", async (_, who) => {
    expect(
      await rejection(
        permissions.requireCanCreateCourse(await signedInRequest(who().id))
      )
    ).toEqual({ status: 403, message: "Only Instructors can create courses." });
  });

  it("lets an Instructor in", async () => {
    expect(
      await permissions.requireCanCreateCourse(
        await signedInRequest(instructor.id)
      )
    ).toEqual({ userId: instructor.id, isPlatformAdmin: false });
  });
});

describe("requireCanManageCourse", () => {
  const NOT_YOURS = {
    status: 403,
    message: "Only this course's Instructor can do that.",
  };

  it("rejects a signed-out request with 401", async () => {
    expect(
      (
        await rejection(
          permissions.requireCanManageCourse(signedOutRequest(), course.id)
        )
      ).status
    ).toBe(401);
  });

  it("answers 404 for a missing course, before checking ownership", async () => {
    expect(
      await rejection(
        permissions.requireCanManageCourse(
          await signedInRequest(student.id),
          9999
        )
      )
    ).toEqual({ status: 404, message: "Course not found." });
  });

  it("lets the Owning Instructor in and returns the course", async () => {
    const result = await permissions.requireCanManageCourse(
      await signedInRequest(instructor.id),
      course.id
    );
    expect(result.viewer).toEqual({
      userId: instructor.id,
      isPlatformAdmin: false,
    });
    expect(result.course).toEqual(course);
  });

  it("lets a Platform Admin manage any course", async () => {
    const result = await permissions.requireCanManageCourse(
      await signedInRequest(platformAdmin.id),
      course.id
    );
    expect(result.viewer.isPlatformAdmin).toBe(true);
  });

  it("rejects another Instructor's course with 403", async () => {
    const other = addUser(db, "Olive Other", UserRole.Instructor);
    expect(
      await rejection(
        permissions.requireCanManageCourse(
          await signedInRequest(other.id),
          course.id
        )
      )
    ).toEqual(NOT_YOURS);
  });

  it("rejects a Student with 403", async () => {
    expect(
      await rejection(
        permissions.requireCanManageCourse(
          await signedInRequest(student.id),
          course.id
        )
      )
    ).toEqual(NOT_YOURS);
  });

  it("rejects an owner who is no longer an Instructor", async () => {
    db.update(schema.users)
      .set({ role: UserRole.Student })
      .where(eq(schema.users.id, instructor.id))
      .run();
    expect(
      await rejection(
        permissions.requireCanManageCourse(
          await signedInRequest(instructor.id),
          course.id
        )
      )
    ).toEqual(NOT_YOURS);
  });
});
