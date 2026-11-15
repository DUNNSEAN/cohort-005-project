import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { createPermissions, type Permissions } from "../index.server";
import {
  addCourse,
  addLesson,
  addUser,
  enroll,
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

describe("content Permission", () => {
  // Tier 3 (50% off): a discounted, regional price.
  const REGIONAL = "IN";
  // Tier 1: full price.
  const FULL_PRICE = "US";

  let paidCourse: typeof schema.courses.$inferSelect;
  let lesson: typeof schema.lessons.$inferSelect;

  beforeEach(() => {
    paidCourse = addCourse(db, instructor.id, course.categoryId, {
      title: "Paid Course",
      price: 4999,
      pppEnabled: true,
    });
    lesson = addLesson(db, paidCourse.id);
  });

  async function verdictFor(request: Request, lessonId = lesson.id) {
    return (await permissions.lessonPermission(request, lessonId)).verdict;
  }

  describe("lessonPermission", () => {
    it("answers 404 for a missing lesson", async () => {
      expect(
        await rejection(permissions.lessonPermission(signedOutRequest(), 9999))
      ).toEqual({ status: 404, message: "Lesson not found." });
    });

    it("denies a signed-out visitor without throwing", async () => {
      expect(
        await permissions.lessonPermission(signedOutRequest(), lesson.id)
      ).toEqual({
        viewer: null,
        enrolled: false,
        canManage: false,
        courseId: paidCourse.id,
        verdict: { allowed: false, reason: "signed-out" },
      });
    });

    it("denies a Student with no Enrollment", async () => {
      expect(await verdictFor(await signedInRequest(student.id))).toEqual({
        allowed: false,
        reason: "not-enrolled",
      });
    });

    it("allows an enrolled Student", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: FULL_PRICE });
      const permission = await permissions.lessonPermission(
        await signedInRequest(student.id),
        lesson.id
      );
      expect(permission).toEqual({
        viewer: { userId: student.id, isPlatformAdmin: false },
        enrolled: true,
        canManage: false,
        courseId: paidCourse.id,
        verdict: { allowed: true },
      });
    });

    it("allows the Owning Instructor and a Platform Admin without an Enrollment", async () => {
      for (const who of [instructor, platformAdmin]) {
        const permission = await permissions.lessonPermission(
          await signedInRequest(who.id, { country: "BR" }),
          lesson.id
        );
        expect(permission.canManage).toBe(true);
        expect(permission.verdict).toEqual({ allowed: true });
      }
    });

    it("denies an owner who is no longer an Instructor", async () => {
      db.update(schema.users)
        .set({ role: UserRole.Student })
        .where(eq(schema.users.id, instructor.id))
        .run();
      expect(await verdictFor(await signedInRequest(instructor.id))).toEqual({
        allowed: false,
        reason: "not-enrolled",
      });
    });
  });

  describe("the PPP block (ADR-0009)", () => {
    it("blocks a regional-price purchase viewed from another country", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: REGIONAL });
      expect(
        await verdictFor(await signedInRequest(student.id, { country: "GB" }))
      ).toEqual({
        allowed: false,
        reason: "ppp-blocked",
        purchaseCountry: REGIONAL,
        currentCountry: "GB",
      });
    });

    it("allows a regional-price purchase viewed from its own country", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: REGIONAL });
      expect(
        await verdictFor(
          await signedInRequest(student.id, { country: REGIONAL })
        )
      ).toEqual({ allowed: true });
    });

    it("allows a regional-price purchase when the country is unknown (ADR-0012)", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: REGIONAL });
      expect(await verdictFor(await signedInRequest(student.id))).toEqual({
        allowed: true,
      });
    });

    it("never blocks a full-price purchase", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: FULL_PRICE });
      expect(
        await verdictFor(await signedInRequest(student.id, { country: "IN" }))
      ).toEqual({ allowed: true });
    });

    it("never blocks a purchase with no recorded country", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: null });
      expect(
        await verdictFor(await signedInRequest(student.id, { country: "GB" }))
      ).toEqual({ allowed: true });
    });

    it("never blocks on a PPP-disabled course", async () => {
      const noPpp = addCourse(db, instructor.id, course.categoryId, {
        title: "No PPP",
        price: 4999,
        pppEnabled: false,
      });
      enroll(db, student.id, noPpp.id, { purchaseCountry: REGIONAL });
      expect(
        await verdictFor(
          await signedInRequest(student.id, { country: "GB" }),
          addLesson(db, noPpp.id).id
        )
      ).toEqual({ allowed: true });
    });

    it("never blocks on a free course", async () => {
      const free = addCourse(db, instructor.id, course.categoryId, {
        title: "Free",
        price: 0,
      });
      enroll(db, student.id, free.id, { purchaseCountry: REGIONAL });
      expect(
        await verdictFor(
          await signedInRequest(student.id, { country: "GB" }),
          addLesson(db, free.id).id
        )
      ).toEqual({ allowed: true });
    });

    it("never blocks the Owning Instructor", async () => {
      enroll(db, instructor.id, paidCourse.id, { purchaseCountry: REGIONAL });
      expect(
        await verdictFor(
          await signedInRequest(instructor.id, { country: "GB" })
        )
      ).toEqual({ allowed: true });
    });
  });

  describe("requireCanViewLesson", () => {
    it("rejects a signed-out request with 401", async () => {
      expect(
        (
          await rejection(
            permissions.requireCanViewLesson(signedOutRequest(), lesson.id)
          )
        ).status
      ).toBe(401);
    });

    it("rejects a Student with no Enrollment with 403", async () => {
      expect(
        await rejection(
          permissions.requireCanViewLesson(
            await signedInRequest(student.id),
            lesson.id
          )
        )
      ).toEqual({ status: 403, message: "You must be enrolled in this course." });
    });

    it("rejects a PPP-blocked Student with 403 naming both countries", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: REGIONAL });
      const { status, message } = await rejection(
        permissions.requireCanViewLesson(
          await signedInRequest(student.id, { country: "GB" }),
          lesson.id
        )
      );
      expect(status).toBe(403);
      expect(message).toContain("India");
      expect(message).toContain("United Kingdom");
    });

    it("checks the lesson's own course, not one the caller has in mind", async () => {
      // Enrolled on the seeded course, asking about a lesson in another one.
      enroll(db, student.id, course.id);
      expect(
        (
          await rejection(
            permissions.requireCanViewLesson(
              await signedInRequest(student.id),
              lesson.id
            )
          )
        ).status
      ).toBe(403);
    });

    it("returns the Viewer, whether they manage the course, and its id", async () => {
      enroll(db, student.id, paidCourse.id);
      expect(
        await permissions.requireCanViewLesson(
          await signedInRequest(student.id),
          lesson.id
        )
      ).toEqual({
        viewer: { userId: student.id, isPlatformAdmin: false },
        canManage: false,
        courseId: paidCourse.id,
      });
      expect(
        (
          await permissions.requireCanViewLesson(
            await signedInRequest(instructor.id),
            lesson.id
          )
        ).canManage
      ).toBe(true);
    });
  });

  describe("requireCanViewCourse", () => {
    it("answers 404 for a missing course", async () => {
      expect(
        await rejection(
          permissions.requireCanViewCourse(
            await signedInRequest(student.id),
            9999
          )
        )
      ).toEqual({ status: 404, message: "Course not found." });
    });

    it("rejects a PPP-blocked Student with 403", async () => {
      enroll(db, student.id, paidCourse.id, { purchaseCountry: REGIONAL });
      expect(
        (
          await rejection(
            permissions.requireCanViewCourse(
              await signedInRequest(student.id, { country: "GB" }),
              paidCourse.id
            )
          )
        ).status
      ).toBe(403);
    });

    it("lets an enrolled Student in", async () => {
      enroll(db, student.id, paidCourse.id);
      expect(
        await permissions.requireCanViewCourse(
          await signedInRequest(student.id),
          paidCourse.id
        )
      ).toEqual({
        viewer: { userId: student.id, isPlatformAdmin: false },
        canManage: false,
      });
    });
  });
});
