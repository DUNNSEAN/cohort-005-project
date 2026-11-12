import { useEffect, useState } from "react";
import { data, isRouteErrorResponse, Link, useFetcher } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { AlertTriangle, ReceiptText } from "lucide-react";
import type { Route } from "./+types/admin.refunds";
import { db } from "~/db";
import { UserRole, users } from "~/db/schema";
import { getCurrentUserId } from "~/lib/session";
import { parseFormData } from "~/lib/validation";
import { formatPrice } from "~/lib/utils";
import {
  approveRefundRequest,
  declineRefundRequest,
  listOpenRefundRequests,
  type OpenRefundRequest,
} from "~/lib/refund-decisions.server";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

const refundDecisionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("approve"),
    refundRequestId: z.coerce.number().int(),
  }),
  z.object({
    intent: z.literal("decline"),
    refundRequestId: z.coerce.number().int(),
    reason: z
      .string()
      .trim()
      .min(1, "Tell the buyer why their Refund Request was declined.")
      .max(1000, "Please keep the reason under 1000 characters."),
  }),
]);

// Only a Platform Admin decides Refund Requests (GLOSSARY.md).
async function requirePlatformAdmin(request: Request) {
  const currentUserId = await getCurrentUserId(request);

  if (!currentUserId) {
    throw data("Select a user from the DevUI panel to decide Refund Requests.", {
      status: 401,
    });
  }

  const currentUser = db
    .select()
    .from(users)
    .where(eq(users.id, currentUserId))
    .get();

  if (!currentUser || currentUser.role !== UserRole.Admin) {
    throw data("Only a Platform Admin can decide Refund Requests.", {
      status: 403,
    });
  }

  return currentUser;
}

export function meta() {
  return [{ title: "Refund Requests — Cadence" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requirePlatformAdmin(request);
  return { refundRequests: listOpenRefundRequests(db) };
}

export async function action({ request }: Route.ActionArgs) {
  const platformAdmin = await requirePlatformAdmin(request);

  const parsed = parseFormData(await request.formData(), refundDecisionSchema);
  if (!parsed.success) {
    return data(
      { error: Object.values(parsed.errors)[0] ?? "Invalid input." },
      { status: 400 }
    );
  }

  const decision = parsed.data;
  const now = new Date();
  const result = db.transaction((tx) =>
    decision.intent === "approve"
      ? approveRefundRequest(tx, decision.refundRequestId, platformAdmin.id, now)
      : declineRefundRequest(
          tx,
          decision.refundRequestId,
          platformAdmin.id,
          decision.reason,
          now
        )
  );

  if (!result.ok) {
    throw data(result.error, { status: result.status });
  }

  return { decided: decision.intent };
}

export default function AdminRefunds({ loaderData }: Route.ComponentProps) {
  const { refundRequests } = loaderData;

  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <h1 className="mb-2 text-2xl font-bold">Refund Requests</h1>
      <p className="mb-8 text-muted-foreground">
        Open Refund Requests, oldest first. Approving one ends what the
        Purchase granted and records a Refund of the full amount paid.
      </p>

      {refundRequests.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <ReceiptText className="mx-auto mb-3 size-8" />
            No Open Refund Requests.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {refundRequests.map((refundRequest) => (
            <RefundRequestCard
              key={refundRequest.id}
              refundRequest={refundRequest}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RefundRequestCard({
  refundRequest,
}: {
  refundRequest: OpenRefundRequest;
}) {
  const fetcher = useFetcher<{ error?: string; decided?: string }>();
  const [isDeclining, setIsDeclining] = useState(false);
  const isSubmitting = fetcher.state !== "idle";
  const { purchase } = refundRequest;

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Link
              to={`/courses/${refundRequest.courseSlug}`}
              className="font-semibold hover:underline"
            >
              {refundRequest.courseTitle}
            </Link>
            <p className="text-sm text-muted-foreground">
              {refundRequest.buyerName} ({refundRequest.buyerEmail})
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">
              {formatPrice(refundRequest.amountPaid)}
            </p>
            <p className="text-muted-foreground">
              {purchase.kind === "team-licence"
                ? `Team Licence · ${purchase.claimedSeatCount} of ${purchase.seatCount} Seats claimed`
                : "Individual Purchase"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Bought {new Date(refundRequest.purchasedAt).toLocaleDateString()} ·
          requested {new Date(refundRequest.requestedAt).toLocaleDateString()}
        </p>
        <p className="text-sm">{refundRequest.reason}</p>

        {!refundRequest.canApprove && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            A Seat on this Team Licence has been claimed, so it can only be
            declined.
          </p>
        )}

        {isDeclining ? (
          <fetcher.Form method="post" className="space-y-2">
            <input type="hidden" name="intent" value="decline" />
            <input
              type="hidden"
              name="refundRequestId"
              value={refundRequest.id}
            />
            <Textarea
              name="reason"
              rows={3}
              required
              placeholder="Why it's declined. The buyer will see this."
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                variant="destructive"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Declining..." : "Decline"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setIsDeclining(false)}
              >
                Cancel
              </Button>
            </div>
          </fetcher.Form>
        ) : (
          <div className="flex gap-2">
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="approve" />
              <input
                type="hidden"
                name="refundRequestId"
                value={refundRequest.id}
              />
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting || !refundRequest.canApprove}
              >
                {isSubmitting ? "Approving..." : "Approve"}
              </Button>
            </fetcher.Form>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setIsDeclining(true)}
            >
              Decline
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let message = "An unexpected error occurred while loading Refund Requests.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 401
        ? "Sign in required"
        : error.status === 403
          ? "Access denied"
          : `Error ${error.status}`;
    message = typeof error.data === "string" ? error.data : error.statusText;
  }

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-6">
      <div className="text-center">
        <AlertTriangle className="mx-auto mb-4 size-12 text-muted-foreground" />
        <h1 className="mb-2 text-2xl font-bold">{title}</h1>
        <p className="mb-6 text-muted-foreground">{message}</p>
        <Link to="/admin/refunds">
          <Button>Back to Refund Requests</Button>
        </Link>
      </div>
    </div>
  );
}
