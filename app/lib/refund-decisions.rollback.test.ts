import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundRequestStatus, UserRole } from "~/db/schema";
import {
  approveRefundRequest,
  declineRefundRequest,
} from "./refund-decisions.server";

// Simulates a bug in the Notification code. ADR 0013: the Notification shares
// the decision's transaction, so the decision must not be saved.
vi.mock("~/lib/notifications.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/lib/notifications.server")>()),
  createNotifications: vi.fn(() => {
    throw new Error("Notification write failed");
  }),
}));

const NOW = new Date(2026, 0, 5, 12, 0);

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let platformAdminId: number;
let refundRequestId: number;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);
  platformAdminId = testDb
    .insert(schema.users)
    .values({ name: "Admin", email: "admin@example.com", role: UserRole.Admin })
    .returning()
    .get().id;
  const purchase = testDb
    .insert(schema.purchases)
    .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900 })
    .returning()
    .get();
  testDb
    .insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id })
    .run();
  refundRequestId = testDb
    .insert(schema.refundRequests)
    .values({ purchaseId: purchase.id, reason: "Not for me." })
    .returning()
    .get().id;
});

function refundRequest() {
  return testDb
    .select()
    .from(schema.refundRequests)
    .where(eq(schema.refundRequests.id, refundRequestId))
    .get();
}

describe("when creating a Notification fails", () => {
  it("doesn't save the approval, and the buyer stays enrolled", () => {
    expect(() =>
      testDb.transaction((tx) =>
        approveRefundRequest(tx, refundRequestId, platformAdminId, NOW)
      )
    ).toThrow("Notification write failed");

    expect(refundRequest()).toMatchObject({
      status: RefundRequestStatus.Open,
      amountRefunded: null,
      resolvedAt: null,
    });
    expect(testDb.select().from(schema.enrollments).all()).toHaveLength(1);
  });

  it("doesn't save the decline", () => {
    expect(() =>
      testDb.transaction((tx) =>
        declineRefundRequest(tx, refundRequestId, platformAdminId, "No.", NOW)
      )
    ).toThrow("Notification write failed");

    expect(refundRequest()).toMatchObject({
      status: RefundRequestStatus.Open,
      declineReason: null,
    });
  });
});
