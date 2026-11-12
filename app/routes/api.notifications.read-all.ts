import type { Route } from "./+types/api.notifications.read-all";
import { db } from "~/db";
import { requireUserId } from "~/lib/access.server";
import { markAllNotificationsRead } from "~/lib/notifications.server";

/** Mark all read: clears every Unread Notification the person has. */
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);

  markAllNotificationsRead(db, userId);

  return { ok: true };
}
