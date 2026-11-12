import type { Route } from "./+types/api.notifications.unread-count";
import { db } from "~/db";
import { requireUserId } from "~/lib/access.server";
import { countUnreadNotifications } from "~/lib/notifications.server";

/** The bell polls this for the person's unread count, and nothing else. */
export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  return { unreadCount: countUnreadNotifications(db, userId) };
}
