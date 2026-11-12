import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { alias } from "drizzle-orm/sqlite-core";
import * as schema from "~/db/schema";
import {
  comments,
  courseRatings,
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
import { MAX_RATING } from "~/lib/ratings";

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
      return discussionQuestionAudience(tx, event.commentId);
    case NotificationKind.RefundDecision:
      return NOBODY;
    case NotificationKind.Enrollment:
      return enrollmentAudience(tx, event.enrollmentId);
    case NotificationKind.FirstRating:
      return firstRatingAudience(tx, event.ratingId);
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
  [NotificationKind.DiscussionQuestion]: discussionQuestionFeedContent,
  [NotificationKind.RefundDecision]: noContent,
  [NotificationKind.Enrollment]: enrollmentFeedContent,
  [NotificationKind.FirstRating]: firstRatingFeedContent,
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

/**
 * Marks read the person's own Unread Notifications about one Discussion
 * Question's thread: the `discussion_question` Notification for it and any
 * `discussion_reply` Notifications on it. Called when they post a Discussion
 * Reply there; nobody else's Notifications are touched.
 */
export function markThreadNotificationsRead(
  db: Queryable,
  userId: number,
  threadId: number
) {
  const replyIds = db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.parentId, threadId));

  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(
        eq(notifications.recipientId, userId),
        isNull(notifications.readAt),
        or(
          and(
            eq(notifications.kind, NotificationKind.DiscussionQuestion),
            eq(notifications.subjectId, threadId)
          ),
          and(
            eq(notifications.kind, NotificationKind.DiscussionReply),
            inArray(notifications.subjectId, replyIds)
          )
        )
      )
    )
    .run();
}

/**
 * Marks every Unread Notification the person has read, including ones the
 * feed isn't showing, so the badge really goes to zero.
 */
export function markAllNotificationsRead(db: Queryable, userId: number) {
  db.update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(
      and(eq(notifications.recipientId, userId), isNull(notifications.readAt))
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
  const course = courseForComment(tx, reply.id);
  if (!post || !course) return NOBODY;

  // A Platform Admin's answer is moderation, not work for the Instructor.
  const instructorIds = isPlatformAdmin(tx, reply.userId)
    ? []
    : [course.instructorId];

  // The post's author and the Instructor may be the same person; the Set in
  // createNotifications gives them one Notification, worded for the author.
  const recipientIds = [post.userId, ...instructorIds].filter(
    (id) => !isLapsed(tx, id, course.courseId)
  );
  return { subjectId: reply.id, actorId: reply.userId, recipientIds };
}

/** Worded for the viewer: "your post" wins for the post's author. */
function replyAction(
  reply: { actorId: number; postAuthorId: number; postAuthorName: string },
  viewerId: number
) {
  if (reply.postAuthorId === viewerId) return "replied to your post";
  if (reply.postAuthorId === reply.actorId) return "replied to their own post";
  return `replied to ${reply.postAuthorName}'s post`;
}

const posts = alias(comments, "posts");
const postAuthors = alias(users, "post_authors");

function discussionReplyFeedContent(
  db: Queryable,
  replyIds: number[],
  viewerId: number
): Map<number, FeedItemContent> {
  const replies = db
    .select({
      id: comments.id,
      body: comments.body,
      actorId: comments.userId,
      actorName: users.name,
      postAuthorId: postAuthors.id,
      postAuthorName: postAuthors.name,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .innerJoin(posts, eq(comments.parentId, posts.id))
    .innerJoin(postAuthors, eq(posts.userId, postAuthors.id))
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
        action: replyAction(reply, viewerId),
        quote: reply.body,
        courseTitle: reply.courseTitle,
        lessonTitle: reply.lessonTitle,
        href: lessonHref(reply.courseSlug, reply.lessonId, reply.id),
      },
    ])
  );
}

// ─── discussion_question: a Discussion Question; the subject is the Question ───

/** The course a Comment was posted on, with its Instructor. */
function courseForComment(db: Queryable, commentId: number) {
  return db
    .select({ courseId: courses.id, instructorId: courses.instructorId })
    .from(comments)
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(comments.id, commentId))
    .get();
}

function isPlatformAdmin(db: Queryable, userId: number) {
  const user = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return user?.role === UserRole.Admin;
}

function discussionQuestionAudience(
  tx: Tx,
  questionId: number
): Audience | null {
  const question = tx
    .select()
    .from(comments)
    .where(eq(comments.id, questionId))
    .get();
  if (!question || question.parentId !== null) return NOBODY;

  const course = courseForComment(tx, question.id);
  if (!course) return NOBODY;

  // A top-level post by staff is a Comment, not a Discussion Question.
  const byStaff =
    question.userId === course.instructorId ||
    isPlatformAdmin(tx, question.userId);
  if (byStaff) return NOBODY;

  return {
    subjectId: question.id,
    actorId: question.userId,
    recipientIds: [course.instructorId],
  };
}

function discussionQuestionFeedContent(
  db: Queryable,
  questionIds: number[]
): Map<number, FeedItemContent> {
  const questions = db
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
    .where(and(inArray(comments.id, questionIds), isNull(comments.deletedAt)))
    .all();

  return new Map(
    questions.map((question) => [
      question.id,
      {
        actorName: question.actorName,
        action: "asked a Discussion Question",
        quote: question.body,
        courseTitle: question.courseTitle,
        lessonTitle: question.lessonTitle,
        href: lessonHref(question.courseSlug, question.lessonId, question.id),
      },
    ])
  );
}

// ─── first_rating: a Student's first rating of a course; the subject is the rating ───

function firstRatingAudience(tx: Tx, ratingId: number): Audience | null {
  const rating = tx
    .select({
      id: courseRatings.id,
      userId: courseRatings.userId,
      instructorId: courses.instructorId,
    })
    .from(courseRatings)
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(eq(courseRatings.id, ratingId))
    .get();
  if (!rating) return NOBODY;

  return {
    subjectId: rating.id,
    actorId: rating.userId,
    recipientIds: [rating.instructorId],
  };
}

function firstRatingFeedContent(
  db: Queryable,
  ratingIds: number[]
): Map<number, FeedItemContent> {
  const ratings = db
    .select({
      id: courseRatings.id,
      rating: courseRatings.rating,
      actorName: users.name,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(courseRatings)
    .innerJoin(users, eq(courseRatings.userId, users.id))
    .innerJoin(courses, eq(courseRatings.courseId, courses.id))
    .where(inArray(courseRatings.id, ratingIds))
    .all();

  return new Map(
    ratings.map((rating) => [
      rating.id,
      {
        actorName: rating.actorName,
        action: `gave your course its first rating — ${stars(rating.rating)}`,
        quote: null,
        courseTitle: rating.courseTitle,
        lessonTitle: null,
        href: `/courses/${rating.courseSlug}`,
      },
    ])
  );
}

// ─── enrollment: a new Enrollment; the subject is the Enrollment ───

function enrollmentAudience(tx: Tx, enrollmentId: number): Audience | null {
  const enrollment = tx
    .select({
      userId: enrollments.userId,
      instructorId: courses.instructorId,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(eq(enrollments.id, enrollmentId))
    .get();
  if (!enrollment) return NOBODY;

  return {
    subjectId: enrollmentId,
    actorId: enrollment.userId,
    recipientIds: [enrollment.instructorId],
  };
}

function enrollmentFeedContent(
  db: Queryable,
  enrollmentIds: number[]
): Map<number, FeedItemContent> {
  const rows = db
    .select({
      id: enrollments.id,
      actorName: users.name,
      courseId: courses.id,
      courseTitle: courses.title,
    })
    .from(enrollments)
    .innerJoin(users, eq(enrollments.userId, users.id))
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .where(inArray(enrollments.id, enrollmentIds))
    .all();

  return new Map(
    rows.map((row) => [
      row.id,
      {
        actorName: row.actorName,
        action: `enrolled in ${row.courseTitle}`,
        quote: null,
        courseTitle: row.courseTitle,
        lessonTitle: null,
        href: `/instructor/${row.courseId}/students`,
      },
    ])
  );
}

function stars(rating: number) {
  return "★".repeat(rating) + "☆".repeat(Math.max(0, MAX_RATING - rating));
}
