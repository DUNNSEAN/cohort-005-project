import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import {
  comments,
  courses,
  enrollments,
  lessons,
  modules,
  notifications,
  users,
  NotificationKind,
  UserRole,
} from "~/db/schema";
import type { Tx } from "~/lib/comments.server";

type Db = BetterSQLite3Database<typeof schema>;
type Queryable = Db | Tx;

// ─── Writing: createNotifications ───

/**
 * Something that happened which may concern people. Carries ids only: who is
 * notified is worked out by `createNotifications`, and what they see is built
 * at read time by the feed.
 */
export type NotificationEvent =
  | { kind: NotificationKind.DiscussionReply; commentId: number }
  | { kind: NotificationKind.DiscussionQuestion; commentId: number }
  | { kind: NotificationKind.RefundDecision; refundRequestId: number }
  | { kind: NotificationKind.Enrollment; enrollmentId: number }
  | { kind: NotificationKind.FirstRating; ratingId: number };

/** Who an event concerns, before the rules every kind shares are applied. */
type Audience = {
  /** The id `notifications.subjectId` points at for this kind. */
  subjectId: number;
  /** Whoever caused the event. Nobody is notified of their own action. */
  actorId: number;
  recipientIds: number[];
};

const NOBODY = null;

/**
 * The one entry point for creating Notifications (ADR 0013). Runs inside the
 * triggering event's transaction, so if it throws, the event rolls back too.
 * It only creates Notifications; it never marks anything read.
 */
export function createNotifications(tx: Tx, event: NotificationEvent): void {
  const audience = audienceFor(tx, event);
  if (!audience) return;

  const recipientIds = [...new Set(audience.recipientIds)].filter(
    (id) => id !== audience.actorId
  );
  if (recipientIds.length === 0) return;

  tx.insert(notifications)
    .values(
      recipientIds.map((recipientId) => ({
        recipientId,
        kind: event.kind,
        subjectId: audience.subjectId,
      }))
    )
    .run();
}

// One case per kind. Each kind's recipient rules live in its own function
// below, so kinds can be added independently.
function audienceFor(tx: Tx, event: NotificationEvent): Audience | null {
  switch (event.kind) {
    case NotificationKind.DiscussionReply:
      return discussionReplyAudience(tx, event.commentId);
    case NotificationKind.DiscussionQuestion:
      return NOBODY;
    case NotificationKind.RefundDecision:
      return NOBODY;
    case NotificationKind.Enrollment:
      return NOBODY;
    case NotificationKind.FirstRating:
      return NOBODY;
    default: {
      const unhandled: never = event;
      throw new Error(`Unhandled notification event: ${String(unhandled)}`);
    }
  }
}

// ─── Reading: the Notification Feed ───

/** One item in a person's Notification Feed, rendered at read time. */
export type NotificationItem = {
  id: number;
  kind: NotificationKind;
  /** Shown in bold before `action`. Null for items with no actor. */
  actorName: string | null;
  /** The rest of the sentence, e.g. "replied to your post". */
  action: string;
  /** A short quote of the subject, for discussion items only. */
  quote: string | null;
  courseTitle: string;
  lessonTitle: string | null;
  /** Where clicking the item goes. */
  href: string;
  createdAt: string;
  read: boolean;
};

/** The parts of a feed item that come from its subject. */
type FeedItemContent = Pick<
  NotificationItem,
  "actorName" | "action" | "quote" | "courseTitle" | "lessonTitle" | "href"
>;

/**
 * Builds feed content for a batch of subjects of one kind, keyed by subject
 * id. A subject missing from the result (e.g. a soft-deleted Comment) hides
 * its Notifications from the feed and the unread count.
 */
type FeedContentLoader = (
  db: Queryable,
  subjectIds: number[],
  viewerId: number
) => Map<number, FeedItemContent>;

const noContent: FeedContentLoader = () => new Map();

// One entry per kind. Each kind's rendering lives in its own function below.
const feedContentLoaders: Record<NotificationKind, FeedContentLoader> = {
  [NotificationKind.DiscussionReply]: discussionReplyFeedContent,
  [NotificationKind.DiscussionQuestion]: noContent,
  [NotificationKind.RefundDecision]: noContent,
  [NotificationKind.Enrollment]: noContent,
  [NotificationKind.FirstRating]: noContent,
};

const FEED_LIMIT = 50;

type NotificationRow = typeof notifications.$inferSelect;

/** A person's Notification Feed, newest first. Reading it marks nothing read. */
export function listNotifications(
  db: Queryable,
  userId: number
): NotificationItem[] {
  const rows = db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(FEED_LIMIT)
    .all();

  return render(db, rows, userId);
}

/** How many Unread Notifications the person has, as the bell shows it. */
export function countUnreadNotifications(db: Queryable, userId: number) {
  const rows = db
    .select()
    .from(notifications)
    .where(
      and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
    )
    .all();

  return render(db, rows, userId).length;
}

/** Marks one of the person's Notifications read. Ignores anyone else's. */
export function markNotificationRead(
  db: Queryable,
  userId: number,
  notificationId: number
) {
  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt)
      )
    )
    .run();
}

function render(
  db: Queryable,
  rows: NotificationRow[],
  viewerId: number
): NotificationItem[] {
  const contentByKind = new Map<NotificationKind, Map<number, FeedItemContent>>();
  for (const kind of new Set(rows.map((row) => row.kind))) {
    const subjectIds = rows
      .filter((row) => row.kind === kind)
      .map((row) => row.subjectId);
    contentByKind.set(
      kind,
      feedContentLoaders[kind](db, [...new Set(subjectIds)], viewerId)
    );
  }

  return rows.flatMap((row) => {
    const content = contentByKind.get(row.kind)?.get(row.subjectId);
    if (!content) return [];
    return [
      {
        id: row.id,
        kind: row.kind,
        ...content,
        createdAt: row.createdAt,
        read: row.readAt !== null,
      },
    ];
  });
}

// ─── Shared rules ───

/**
 * A Lapsed Student has lost their Enrollment on the course. Staff (the
 * course's Instructor and Platform Admins) are never Lapsed.
 */
function isLapsed(db: Queryable, userId: number, courseId: number) {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!user || user.role === UserRole.Admin) return false;

  const course = db
    .select({ instructorId: courses.instructorId })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (course?.instructorId === userId) return false;

  const enrollment = db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
  return !enrollment;
}

function lessonHref(courseSlug: string, lessonId: number, commentId: number) {
  return `/courses/${courseSlug}/lessons/${lessonId}#comment-${commentId}`;
}

function courseIdForLesson(db: Queryable, lessonId: number) {
  return db
    .select({ courseId: modules.courseId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(lessons.id, lessonId))
    .get()?.courseId;
}

// ─── discussion_reply: a Discussion Reply; the subject is the Reply ───

function discussionReplyAudience(tx: Tx, replyId: number): Audience | null {
  const reply = tx
    .select()
    .from(comments)
    .where(eq(comments.id, replyId))
    .get();
  if (!reply || reply.parentId === null) return NOBODY;

  const post = tx
    .select({ userId: comments.userId })
    .from(comments)
    .where(eq(comments.id, reply.parentId))
    .get();
  const courseId = courseIdForLesson(tx, reply.lessonId);
  if (!post || courseId === undefined) return NOBODY;

  const recipientIds = [post.userId].filter(
    (id) => !isLapsed(tx, id, courseId)
  );
  return { subjectId: reply.id, actorId: reply.userId, recipientIds };
}

function discussionReplyFeedContent(
  db: Queryable,
  replyIds: number[]
): Map<number, FeedItemContent> {
  const replies = db
    .select({
      id: comments.id,
      body: comments.body,
      actorName: users.name,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(and(inArray(comments.id, replyIds), isNull(comments.deletedAt)))
    .all();

  return new Map(
    replies.map((reply) => [
      reply.id,
      {
        actorName: reply.actorName,
        action: "replied to your post",
        quote: reply.body,
        courseTitle: reply.courseTitle,
        lessonTitle: reply.lessonTitle,
        href: lessonHref(reply.courseSlug, reply.lessonId, reply.id),
      },
    ])
  );
}
