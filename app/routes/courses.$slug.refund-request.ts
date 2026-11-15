import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/courses.$slug.refund-request";
import { getCurrentUserId } from "~/lib/session";
import { db } from "~/db";
import {
  courses,
  refundRequests,
  users,
  RefundRequestStatus,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import { parseFormData, parseParams } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import { REFUND_INELIGIBLE_MESSAGES } from "~/lib/refund-requests";
import { getRefundStanding } from "~/lib/refund-requests.server";

const refundRequestParamsSchema = z.object({
  slug: z.string().min(1),
});

const refundRequestActionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "Tell us a little more about why you want a refund.")
    .max(1000, "Please keep your reason under 1000 characters."),
});

/**
 * The confirmation the student gets in their inbox. There is no mail
 * transport wired up yet, so the built message goes to the server log.
 */
function buildRefundRequestReceivedEmail(input: {
  studentName: string;
  studentEmail: string;
  courseTitle: string;
  amountPaid: number;
}) {
  return {
    to: input.studentEmail,
    subject: `Refund Request received — ${input.courseTitle}`,
    body: [
      `Hi ${input.studentName},`,
      "",
      `We have your Refund Request for "${input.courseTitle}".`,
      "Our team reviews every Refund Request by hand. You do not need to do anything else — we will email you again when it has been reviewed.",
      "",
      `If it is approved, we will refund ${formatPrice(input.amountPaid)}, the amount you paid, and your access to the course will end.`,
      "",
      "— The Cadence team",
    ].join("\n"),
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("You must be logged in to request a refund.", { status: 401 });
  }

  const { slug } = parseParams(params, refundRequestParamsSchema);
  const course = db
    .select()
    .from(courses)
    .where(eq(courses.slug, slug))
    .get();

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const student = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!student) {
    throw data("User not found", { status: 404 });
  }

  const standing = getRefundStanding(currentUserId, course.id);

  if (!standing) {
    throw data("You have not bought this course.", { status: 403 });
  }

  if (!standing.eligibility.eligible) {
    const status =
      standing.eligibility.reason === "request-open" ||
      standing.eligibility.reason === "already-refunded"
        ? 409
        : 403;
    throw data(REFUND_INELIGIBLE_MESSAGES[standing.eligibility.reason], {
      status,
    });
  }

  const formData = await request.formData();
  const parsed = parseFormData(formData, refundRequestActionSchema);

  if (!parsed.success) {
    return data({ errors: parsed.errors }, { status: 400 });
  }

  db.insert(refundRequests)
    .values({
      purchaseId: standing.purchase.id,
      status: RefundRequestStatus.Open,
      reason: parsed.data.reason,
    })
    .run();

  const email = buildRefundRequestReceivedEmail({
    studentName: student.name,
    studentEmail: student.email,
    courseTitle: course.title,
    amountPaid: standing.purchase.amountPaid,
  });

  console.log(
    `[email] to=${email.to} subject=${email.subject}\n${email.body}`
  );

  return redirect("/settings");
}
