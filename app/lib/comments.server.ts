import { eq } from "drizzle-orm";
import type { db } from "~/db";
import { comments, lessons, NotificationKind } from "~/db/schema";
import { MAX_COMMENT_LENGTH, MIN_COMMENT_LENGTH } from "~/lib/comments";
import { createNotifications } from "~/lib/notifications.server";

/** A Drizzle transaction, as handed to the callback of `db.transaction`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewComment = {
  userId: number;
  lessonId: number;
  /** Null for a top-level Comment; otherwise the top-level Comment replied to. */
  parentId: number | null;
  body: string;
};

/**
 * Posts a Comment, Discussion Question or Discussion Reply. Runs inside the
 * caller's transaction so other writes about the same event (Notifications)
 * commit or roll back with it. Throws an Error with a user-facing message when
 * the input is invalid.
 */
export function createComment(tx: Tx, input: NewComment) {
  const { userId, lessonId, parentId } = input;
  const body = input.body.trim();
  if (body.length < MIN_COMMENT_LENGTH) {
    throw new Error("Comment cannot be empty");
  }
  if (body.length > MAX_COMMENT_LENGTH) {
    throw new Error(
      `Comment must be ${MAX_COMMENT_LENGTH} characters or fewer`
    );
  }

  const lesson = tx
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .get();
  if (!lesson) {
    throw new Error("Lesson not found");
  }

  if (parentId !== null) {
    const parent = tx
      .select()
      .from(comments)
      .where(eq(comments.id, parentId))
      .get();
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
    if (parent.parentId !== null) {
      throw new Error("Replies can only be one level deep");
    }
  }

  const comment = tx
    .insert(comments)
    .values({ userId, lessonId, parentId, body })
    .returning()
    .get();

  if (comment.parentId !== null) {
    createNotifications(tx, {
      kind: NotificationKind.DiscussionReply,
      commentId: comment.id,
    });
  }

  return comment;
}
