import { data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.notifications.$notificationId.read";
import { db } from "~/db";
import { requireUserId } from "~/lib/access.server";
import { markNotificationRead } from "~/lib/notifications.server";
import { parseFormData, parseParams } from "~/lib/validation";

const paramsSchema = z.object({
  notificationId: z.coerce.number().int().positive(),
});

// Only same-site paths, so the form can't be used as an open redirect.
const formSchema = z.object({
  redirectTo: z
    .string()
    .refine((to) => to.startsWith("/") && !to.startsWith("//")),
});

/** Clicking a feed item: marks it read, then goes to what it's about. */
export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const { notificationId } = parseParams(params, paramsSchema);
  const parsed = parseFormData(await request.formData(), formSchema);
  if (!parsed.success) {
    throw data("Invalid redirect", { status: 400 });
  }

  markNotificationRead(db, userId, notificationId);

  return redirect(parsed.data.redirectTo);
}
