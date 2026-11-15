import { describe, it, expect, beforeEach } from "vitest";
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
