import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { setCurrentUserId } from "~/lib/session";
import { createComment } from "~/lib/comments.server";

const state = vi.hoisted(() => ({
  db: undefined as unknown as ReturnType<typeof createTestDb>,
}));

vi.mock("~/db", () => ({
  get db() {
    return state.db;
  },
}));

const { loader } = await import("./api.notifications.unread-count");

type LoaderArgs = Parameters<typeof loader>[0];

let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  state.db = createTestDb();
  base = seedBaseData(state.db);
});

async function requestAs(userId: number | null) {
  const url = "http://localhost/api/notifications/unread-count";
  if (userId === null) return new Request(url);
  const cookie = await setCurrentUserId(new Request(url), userId);
  return new Request(url, { headers: { Cookie: cookie } });
}

function callLoader(request: Request) {
  return loader({ request, params: {}, context: {} } as unknown as LoaderArgs);
}

/** A post by `authorId` and a Reply to it by `replierId`, which notifies the author. */
function replyTo(authorId: number, replierId: number) {
  const mod = state.db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module 1", position: 1 })
    .returning()
    .get();
  const lessonId = state.db
    .insert(schema.lessons)
    .values({ moduleId: mod.id, title: "Generics", position: 1 })
    .returning()
    .get().id;
  state.db
    .insert(schema.enrollments)
    .values({ userId: authorId, courseId: base.course.id })
    .run();
  state.db.transaction((tx) => {
    const post = createComment(tx, {
      userId: authorId,
      lessonId,
      parentId: null,
      body: "Why use generics?",
    });
    createComment(tx, {
      userId: replierId,
      lessonId,
      parentId: post.id,
      body: "To keep types flowing.",
    });
  });
}

describe("GET /api/notifications/unread-count", () => {
  it("returns 401 with no user in the session", async () => {
    const thrown = await callLoader(await requestAs(null)).catch((e) => e);
    expect(thrown).toMatchObject({ init: { status: 401 } });
  });

  it("returns only the person's unread count", async () => {
    replyTo(base.user.id, base.instructor.id);

    const result = await callLoader(await requestAs(base.user.id));

    expect(result).toEqual({ unreadCount: 1 });
  });

  it("returns zero for someone with no Notifications", async () => {
    const result = await callLoader(await requestAs(base.instructor.id));
    expect(result).toEqual({ unreadCount: 0 });
  });
});
