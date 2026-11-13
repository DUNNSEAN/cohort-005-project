import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import {
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  saveNote,
  toggleBookmark,
} from "./saved.server";
import {
  approveRefundRequest,
  raiseRefundRequest,
} from "./refunds.server";
import { fakeNotifications } from "./notifications.fake.server";
import { MAX_NOTE_LENGTH } from "./notes";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

function minutesAfter(minutes: number) {
  return new Date(NOW.getTime() + minutes * 60_000);
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);

  const module = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Basics", position: 1 })
    .returning()
    .get();

  lessonIds = [1, 2].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: module.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

describe("bookmarking a Lesson", () => {
  it("adds a Bookmark, then removes it on the second toggle", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);

    expect(toggleBookmark(db, base.user.id, lessonIds[0], NOW)).toBe(false);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(false);
  });

  it("never leaves two Bookmarks on the same Lesson", () => {
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    // A racing request that missed the first insert still can't add a second.
    db.insert(schema.bookmarks)
      .values({ userId: base.user.id, lessonId: lessonIds[0] })
      .onConflictDoNothing()
      .run();

    expect(listBookmarks(db, base.user.id)).toHaveLength(1);
  });

  it("is per Student", () => {
    const other = addStudent("Olivia");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);

    expect(isBookmarked(db, other.id, lessonIds[0])).toBe(false);
  });
});

describe("saving a Note", () => {
  it("creates a trimmed Note on a Lesson with none", () => {
    const result = saveNote(db, base.user.id, lessonIds[0], "  # not a heading  ", NOW);

    expect(result.ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])).toEqual({
      body: "# not a heading",
      updatedAt: NOW.toISOString(),
    });
  });

  it("replaces the body and moves the last-edited time on when saved again", () => {
    saveNote(db, base.user.id, lessonIds[0], "first", NOW);
    const later = minutesAfter(5);
    const result = saveNote(db, base.user.id, lessonIds[0], "second", later);

    expect(result).toMatchObject({
      ok: true,
      note: {
        body: "second",
        createdAt: NOW.toISOString(),
        updatedAt: later.toISOString(),
      },
    });
    expect(listNotes(db, base.user.id)).toHaveLength(1);
  });

  it("accepts a Note of exactly the maximum length", () => {
    const body = "a".repeat(MAX_NOTE_LENGTH);

    expect(saveNote(db, base.user.id, lessonIds[0], body, NOW).ok).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });

  it("refuses a Note over 2,000 characters and keeps the old one", () => {
    saveNote(db, base.user.id, lessonIds[0], "kept", NOW);

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "a".repeat(MAX_NOTE_LENGTH + 1),
      minutesAfter(1)
    );

    expect(result).toEqual({
      ok: false,
      error: "Notes must be 2,000 characters or fewer.",
    });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("kept");
  });

  it("removes the Note when saved empty", () => {
    saveNote(db, base.user.id, lessonIds[0], "something", NOW);

    expect(saveNote(db, base.user.id, lessonIds[0], "   ", NOW)).toEqual({
      ok: true,
      note: null,
    });
    expect(getNote(db, base.user.id, lessonIds[0])).toBeUndefined();
  });
});

describe("the Saved lists", () => {
  it("hold only the Student's own rows, newest first, with Lesson and Course", () => {
    const other = addStudent("Olivia");
    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    toggleBookmark(db, base.user.id, lessonIds[1], minutesAfter(1));
    toggleBookmark(db, other.id, lessonIds[0], minutesAfter(2));
    saveNote(db, base.user.id, lessonIds[1], "older", NOW);
    saveNote(db, base.user.id, lessonIds[0], "newer", minutesAfter(1));
    saveNote(db, other.id, lessonIds[0], "not mine", minutesAfter(2));

    expect(listBookmarks(db, base.user.id)).toMatchObject([
      { lessonId: lessonIds[1], lessonTitle: "Lesson 2", courseTitle: "Test Course", courseSlug: "test-course" },
      { lessonId: lessonIds[0], lessonTitle: "Lesson 1", courseTitle: "Test Course", courseSlug: "test-course" },
    ]);
    expect(listNotes(db, base.user.id)).toMatchObject([
      { body: "newer", lessonId: lessonIds[0], courseTitle: "Test Course" },
      { body: "older", lessonId: lessonIds[1], courseTitle: "Test Course" },
    ]);
  });

  it("orders Notes by last edited, not by when they were created", () => {
    saveNote(db, base.user.id, lessonIds[0], "first written", NOW);
    saveNote(db, base.user.id, lessonIds[1], "second written", minutesAfter(1));
    saveNote(db, base.user.id, lessonIds[0], "edited since", minutesAfter(2));

    expect(listNotes(db, base.user.id).map((note) => note.body)).toEqual([
      "edited since",
      "second written",
    ]);
  });
});

describe("an approved Refund", () => {
  it("keeps the Student's Bookmarks and Notes", async () => {
    const notifications = fakeNotifications();
    const platformAdmin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    const purchase = db
      .insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: base.course.id,
        amountPaid: 7900,
        createdAt: new Date(NOW.getTime() - 3 * 86_400_000).toISOString(),
      })
      .returning()
      .get();
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();

    toggleBookmark(db, base.user.id, lessonIds[0], NOW);
    saveNote(db, base.user.id, lessonIds[0], "still here", NOW);

    const raised = await raiseRefundRequest(
      db,
      purchase.id,
      base.user.id,
      "It was not what I expected.",
      NOW,
      notifications
    );
    if (!raised.ok) throw new Error(raised.error);
    const approved = await approveRefundRequest(
      db,
      raised.refundRequestId,
      platformAdmin.id,
      null,
      NOW,
      notifications
    );

    expect(approved.ok).toBe(true);
    expect(isBookmarked(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("still here");
  });
});
