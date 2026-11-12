import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { createComment } from "./comments.server";
import {
  countUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications.server";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;
let lessonId: number;

beforeEach(() => {
  testDb = createTestDb();
  base = seedBaseData(testDb);

  const mod = testDb
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  lessonId = testDb
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Generics", position: 1 })
    .returning()
    .get().id;
  enroll(base.user.id);
});

function addStudent(name: string) {
  return testDb
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase().replace(/\s/g, ".")}@example.com`,
      role: schema.UserRole.Student,
    })
    .returning()
    .get();
}

function enroll(userId: number) {
  testDb
    .insert(schema.enrollments)
    .values({ userId, courseId: base.course.id })
    .run();
}

function post(userId: number, parentId: number | null, body: string) {
  return testDb.transaction((tx) =>
    createComment(tx, { userId, lessonId, parentId, body })
  );
}

describe("discussion_reply", () => {
  it("tells a post's author someone replied, quoting the Reply", () => {
    const question = post(base.user.id, null, "Why use generics?");

    const reply = post(base.instructor.id, question.id, "To keep types precise.");

    expect(listNotifications(testDb, base.user.id)).toEqual([
      expect.objectContaining({
        kind: schema.NotificationKind.DiscussionReply,
        actorName: "Test Instructor",
        action: "replied to your post",
        quote: "To keep types precise.",
        courseTitle: "Test Course",
        lessonTitle: "Generics",
        href: `/courses/test-course/lessons/${lessonId}#comment-${reply.id}`,
        read: false,
      }),
    ]);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(1);
  });

  it("notifies only the post's author, not the replier", () => {
    const question = post(base.user.id, null, "Why use generics?");

    post(base.instructor.id, question.id, "To keep types precise.");

    expect(listNotifications(testDb, base.instructor.id)).toEqual([]);
    expect(countUnreadNotifications(testDb, base.instructor.id)).toBe(0);
  });

  it("notifies the author of a Comment about Replies from other Students", () => {
    const peer = addStudent("Priya Shah");
    enroll(peer.id);
    const comment = post(base.user.id, null, "Sharing my notes on this one.");

    post(peer.id, comment.id, "Thanks, these helped.");

    expect(listNotifications(testDb, base.user.id)).toEqual([
      expect.objectContaining({
        actorName: "Priya Shah",
        action: "replied to your post",
      }),
    ]);
  });

  it("notifies the author of every later Reply, newest first", () => {
    const question = post(base.user.id, null, "Why use generics?");

    post(base.instructor.id, question.id, "First answer.");
    post(base.instructor.id, question.id, "Second answer.");

    expect(
      listNotifications(testDb, base.user.id).map((item) => item.quote)
    ).toEqual(["Second answer.", "First answer."]);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(2);
  });

  it("notifies nobody when you reply to your own post", () => {
    const question = post(base.user.id, null, "Why use generics?");

    post(base.user.id, question.id, "Never mind, I worked it out.");

    expect(listNotifications(testDb, base.user.id)).toEqual([]);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(0);
  });

  it("notifies nobody when a top-level post goes up", () => {
    post(base.user.id, null, "Why use generics?");

    expect(listNotifications(testDb, base.instructor.id)).toEqual([]);
    expect(listNotifications(testDb, base.user.id)).toEqual([]);
  });

  it("doesn't notify a Lapsed Student about Replies to their post", () => {
    const question = post(base.user.id, null, "Why use generics?");
    testDb
      .delete(schema.enrollments)
      .where(eq(schema.enrollments.userId, base.user.id))
      .run();

    post(base.instructor.id, question.id, "To keep types precise.");

    expect(listNotifications(testDb, base.user.id)).toEqual([]);
  });

  it("drops a soft-deleted Reply from the feed and the unread count", () => {
    const question = post(base.user.id, null, "Why use generics?");
    const kept = post(base.instructor.id, question.id, "Kept.");
    const deleted = post(base.instructor.id, question.id, "Deleted.");

    testDb
      .update(schema.comments)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(schema.comments.id, deleted.id))
      .run();

    expect(
      listNotifications(testDb, base.user.id).map((item) => item.href)
    ).toEqual([`/courses/test-course/lessons/${lessonId}#comment-${kept.id}`]);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(1);
  });

  it("shows the Reply's current text after it's edited", () => {
    const question = post(base.user.id, null, "Why use generics?");
    const reply = post(base.instructor.id, question.id, "Typo'd answr.");

    testDb
      .update(schema.comments)
      .set({ body: "Fixed answer." })
      .where(eq(schema.comments.id, reply.id))
      .run();

    expect(listNotifications(testDb, base.user.id)[0].quote).toBe(
      "Fixed answer."
    );
  });
});

describe("marking a Notification read", () => {
  it("marks the clicked item read and lowers the unread count", () => {
    const question = post(base.user.id, null, "Why use generics?");
    post(base.instructor.id, question.id, "First answer.");
    post(base.instructor.id, question.id, "Second answer.");
    const [newest] = listNotifications(testDb, base.user.id);

    markNotificationRead(testDb, base.user.id, newest.id);

    expect(
      listNotifications(testDb, base.user.id).map((item) => [
        item.quote,
        item.read,
      ])
    ).toEqual([
      ["Second answer.", true],
      ["First answer.", false],
    ]);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(1);
  });

  it("leaves someone else's Notification alone", () => {
    const question = post(base.user.id, null, "Why use generics?");
    post(base.instructor.id, question.id, "An answer.");
    const [item] = listNotifications(testDb, base.user.id);

    markNotificationRead(testDb, base.instructor.id, item.id);

    expect(countUnreadNotifications(testDb, base.user.id)).toBe(1);
  });

  it("reading the feed marks nothing read", () => {
    const question = post(base.user.id, null, "Why use generics?");
    post(base.instructor.id, question.id, "An answer.");

    listNotifications(testDb, base.user.id);
    listNotifications(testDb, base.user.id);

    expect(countUnreadNotifications(testDb, base.user.id)).toBe(1);
  });
});

describe("marking all Notifications read", () => {
  it("clears every Unread Notification, including ones the feed isn't showing", () => {
    const question = post(base.user.id, null, "Why use generics?");
    for (let i = 1; i <= 55; i++) {
      post(base.instructor.id, question.id, `Answer ${i}.`);
    }
    expect(listNotifications(testDb, base.user.id)).toHaveLength(50);
    expect(countUnreadNotifications(testDb, base.user.id)).toBe(55);

    markAllNotificationsRead(testDb, base.user.id);

    expect(countUnreadNotifications(testDb, base.user.id)).toBe(0);
    expect(
      listNotifications(testDb, base.user.id).every((item) => item.read)
    ).toBe(true);
  });

  it("leaves other people's Notifications unread", () => {
    const peer = addStudent("Priya Shah");
    enroll(peer.id);
    const mine = post(base.user.id, null, "Why use generics?");
    const theirs = post(peer.id, null, "What about type guards?");
    post(base.instructor.id, mine.id, "An answer.");
    post(base.instructor.id, theirs.id, "Another answer.");

    markAllNotificationsRead(testDb, base.user.id);

    expect(countUnreadNotifications(testDb, base.user.id)).toBe(0);
    expect(countUnreadNotifications(testDb, peer.id)).toBe(1);
  });
});
