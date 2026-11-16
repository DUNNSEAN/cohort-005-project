import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.video-tracking";
import { parseJsonBody } from "~/lib/validation";
import { db } from "~/db";
import { videoWatchEvents } from "~/db/schema";
import { permissions } from "~/modules/permissions/index.server";

const videoTrackingSchema = z.object({
  lessonId: z.number(),
  eventType: z.string(),
  positionSeconds: z.number(),
});

export async function action({ request }: Route.ActionArgs) {
  const parsed = await parseJsonBody(request, videoTrackingSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { lessonId, eventType, positionSeconds } = parsed.data;

  // Only someone who may watch the lesson records watching it.
  const {
    viewer: { userId: currentUserId },
  } = await permissions.requireCanViewLesson(request, lessonId);

  db
    .insert(videoWatchEvents)
    .values({
      userId: currentUserId,
      lessonId,
      eventType,
      positionSeconds,
    })
    .returning()
    .get();

  return { success: true };
}
