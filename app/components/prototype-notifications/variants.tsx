// PROTOTYPE — throwaway. Four structurally different bell + feed variants,
// mounted in the real app shell via ?variant=A|B|C|D. See layout.app.tsx.
import { useState } from "react";
import { Link } from "react-router";
import {
  Bell,
  BellOff,
  CheckCheck,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  Star,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";
import { timeAgo, isToday, type ProtoNotification } from "./data";
import type { ProtoFeed } from "./use-proto-feed";

export const variantNames: Record<string, string> = {
  A: "Sidebar header · compact popover",
  B: "Top bar · tabbed dropdown",
  C: "Beside avatar · filterable pop-up",
  D: "Nav item · full-height panel",
};

function KindIcon({ n, className }: { n: ProtoNotification; className?: string }) {
  const c = cn("size-4 shrink-0", className);
  switch (n.kind) {
    case "question":
      return <MessageCircleQuestion className={c} />;
    case "reply":
    case "course-reply":
      return <MessageSquareReply className={c} />;
    case "enrollment":
      return <UserPlus className={c} />;
    case "first-rating":
      return <Star className={c} />;
    case "refund-approved":
    case "refund-declined":
      return <Receipt className={c} />;
  }
}

function Sentence({ n }: { n: ProtoNotification }) {
  return (
    <>
      {n.actor && <span className="font-semibold">{n.actor} </span>}
      {n.headline}
    </>
  );
}

function EmptyState({ feed, big }: { feed: ProtoFeed; big?: boolean }) {
  return (
    <div className={cn("flex flex-col items-center text-center", big ? "py-24" : "py-10")}>
      <BellOff className="mb-3 size-8 text-muted-foreground/50" />
      <div className="text-sm font-medium">You're all caught up</div>
      <div className="mt-1 max-w-60 text-xs text-muted-foreground">
        {feed.audience === "instructor"
          ? "New Questions, Replies, Enrollments and first ratings on your courses will show up here."
          : "Replies to your Questions and Comments, and Refund Request decisions, will show up here."}
      </div>
    </div>
  );
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white",
        className
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function Backdrop({ onClose, dim }: { onClose: () => void; dim?: boolean }) {
  return (
    <button
      aria-label="Close notifications"
      onClick={onClose}
      className={cn("fixed inset-0 z-40 cursor-default", dim && "bg-black/30")}
    />
  );
}

// ───────────────────────── A: sidebar header bell, compact popover ─────────────────────────

export function VariantAHeaderBell({ feed }: { feed: ProtoFeed }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
      >
        <Bell className="size-4" />
        <CountBadge count={feed.unreadCount} className="absolute -right-1 -top-1" />
      </button>
      {open && (
        <>
          <Backdrop onClose={() => setOpen(false)} />
          <div className="fixed left-[13.5rem] top-2 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {feed.unreadCount > 0 && (
                <button
                  onClick={feed.markAllRead}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Mark all read
                </button>
              )}
            </div>
            {feed.items.length === 0 ? (
              <EmptyState feed={feed} />
            ) : (
              <ul className="max-h-[28rem] divide-y overflow-y-auto">
                {feed.items.map((n) => (
                  <li key={n.id}>
                    <Link
                      to={n.href}
                      onClick={() => {
                        feed.markRead(n.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex gap-3 px-4 py-3 hover:bg-muted/60",
                        n.unread && "bg-primary/5"
                      )}
                    >
                      <KindIcon n={n} className="mt-0.5 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-snug">
                          <Sentence n={n} />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {n.courseTitle}
                          {n.context && ` · ${n.context}`}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(n.minutesAgo)}
                        </span>
                        {n.unread && <span className="size-2 rounded-full bg-blue-500" />}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ───────────────────────── B: new top bar, tabbed dropdown grouped by day ─────────────────────────

export function VariantBTopBar({ feed }: { feed: ProtoFeed }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const shown = tab === "unread" ? feed.items.filter((n) => n.unread) : feed.items;
  const groups = [
    { label: "Today", items: shown.filter(isToday) },
    { label: "Earlier", items: shown.filter((n) => !isToday(n)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-end gap-2 border-b bg-background/95 px-6 backdrop-blur">
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-muted",
            open && "bg-muted"
          )}
        >
          <Bell className="size-4" />
          {feed.unreadCount > 0 ? (
            <span className="font-medium">{feed.unreadCount} new</span>
          ) : (
            <span className="text-muted-foreground">Notifications</span>
          )}
        </button>
        {open && (
          <>
            <Backdrop onClose={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-2 w-[26rem] rounded-lg border bg-popover shadow-xl">
              <div className="flex items-center gap-1 border-b px-3 pt-3">
                {(["all", "unread"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "-mb-px border-b-2 px-3 pb-2 text-sm capitalize",
                      tab === t
                        ? "border-foreground font-medium"
                        : "border-transparent text-muted-foreground"
                    )}
                  >
                    {t}
                    {t === "unread" && feed.unreadCount > 0 && ` (${feed.unreadCount})`}
                  </button>
                ))}
                <button
                  onClick={feed.markAllRead}
                  title="Mark all read"
                  className="mb-2 ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <CheckCheck className="size-4" />
                </button>
              </div>
              {groups.length === 0 ? (
                <EmptyState feed={feed} />
              ) : (
                <div className="max-h-[32rem] overflow-y-auto pb-2">
                  {groups.map((g) => (
                    <div key={g.label}>
                      <div className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {g.label}
                      </div>
                      {g.items.map((n) => (
                        <Link
                          key={n.id}
                          to={n.href}
                          onClick={() => {
                            feed.markRead(n.id);
                            setOpen(false);
                          }}
                          className="flex gap-3 px-4 py-2.5 hover:bg-muted/60"
                        >
                          <div
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                              n.unread ? "bg-blue-500/15 text-blue-600" : "bg-muted text-muted-foreground"
                            )}
                          >
                            {n.actor ? (
                              n.actor.split(" ").map((p) => p[0]).join("").slice(0, 2)
                            ) : (
                              <KindIcon n={n} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className={cn("text-sm", !n.unread && "text-muted-foreground")}>
                              <Sentence n={n} />
                              <span className="text-muted-foreground"> in {n.courseTitle}</span>
                            </div>
                            {n.snippet && (
                              <div className="mt-1 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">
                                {n.snippet}
                              </div>
                            )}
                            <div className="mt-1 text-xs text-muted-foreground">
                              {timeAgo(n.minutesAgo)} ago{n.context && ` · ${n.context}`}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── C: beside avatar, upward pop-up with kind filters ─────────────────────────

const kindFilters: Record<string, { label: string; kinds: string[] }[]> = {
  student: [
    { label: "Replies", kinds: ["reply"] },
    { label: "Refunds", kinds: ["refund-approved", "refund-declined"] },
  ],
  instructor: [
    { label: "Questions", kinds: ["question"] },
    { label: "Replies", kinds: ["course-reply", "reply"] },
    { label: "Enrollments", kinds: ["enrollment"] },
    { label: "Ratings", kinds: ["first-rating"] },
  ],
};

export function VariantCAvatarBell({ feed }: { feed: ProtoFeed }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);
  const filters = kindFilters[feed.audience];
  const active = filters.find((f) => f.label === filter);
  const shown = active ? feed.items.filter((n) => active.kinds.includes(n.kind)) : feed.items;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        className="relative rounded-md p-1 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        {feed.unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-sidebar" />
        )}
      </button>
      {open && (
        <>
          <Backdrop onClose={() => setOpen(false)} />
          <div className="fixed bottom-3 left-[14.5rem] z-50 flex max-h-[80vh] w-[24rem] flex-col rounded-xl border bg-popover shadow-2xl">
            <div className="flex items-center justify-between px-4 pb-2 pt-3">
              <span className="text-sm font-semibold">
                Notifications
                {feed.unreadCount > 0 && (
                  <span className="ml-1.5 text-muted-foreground">· {feed.unreadCount} unread</span>
                )}
              </span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {[null, ...filters.map((f) => f.label)].map((f) => (
                <button
                  key={f ?? "all"}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    filter === f ? "border-foreground bg-foreground text-background" : "text-muted-foreground"
                  )}
                >
                  {f ?? "All"}
                </button>
              ))}
            </div>
            {shown.length === 0 ? (
              <EmptyState feed={feed} />
            ) : (
              <div className="space-y-2 overflow-y-auto px-3 pb-3">
                {shown.map((n) => (
                  <Link
                    key={n.id}
                    to={n.href}
                    onClick={() => {
                      feed.markRead(n.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "block rounded-lg border p-3 hover:bg-muted/60",
                      n.unread && "border-l-4 border-l-blue-500"
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <KindIcon n={n} className="size-3.5" />
                      <span className="truncate">{n.courseTitle}</span>
                      <span className="ml-auto shrink-0">{timeAgo(n.minutesAgo)}</span>
                    </div>
                    <div className="mt-1 text-sm">
                      <Sentence n={n} />
                    </div>
                    {n.snippet && (
                      <div className="mt-1 truncate text-xs italic text-muted-foreground">
                        “{n.snippet}”
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

// ───────────────────────── D: sidebar nav item, full-height panel grouped by course ─────────────────────────

export function VariantDNavItem({ feed }: { feed: ProtoFeed }) {
  const [open, setOpen] = useState(false);
  const byCourse = feed.items.reduce<Record<string, ProtoNotification[]>>((acc, n) => {
    (acc[n.courseTitle] ??= []).push(n);
    return acc;
  }, {});

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          open
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Bell className="size-4" />
        Notifications
        {feed.unreadCount > 0 && (
          <span className="ml-auto rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
            {feed.unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <Backdrop onClose={() => setOpen(false)} dim />
          <aside className="fixed bottom-0 left-56 top-0 z-50 flex w-[30rem] flex-col border-r bg-background shadow-2xl">
            <div className="flex h-14 items-center gap-3 border-b px-5">
              <span className="font-semibold">Notifications</span>
              {feed.unreadCount > 0 && (
                <button
                  onClick={feed.markAllRead}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <CheckCheck className="size-3.5" /> Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className={cn("text-muted-foreground", feed.unreadCount === 0 && "ml-auto")}
              >
                <X className="size-4" />
              </button>
            </div>
            {feed.items.length === 0 ? (
              <EmptyState feed={feed} big />
            ) : (
              <div className="flex-1 overflow-y-auto">
                {Object.entries(byCourse).map(([course, items]) => (
                  <section key={course} className="border-b">
                    <div className="sticky top-0 bg-muted/80 px-5 py-2 text-xs font-semibold backdrop-blur">
                      {course}
                    </div>
                    {items.map((n) => (
                      <div
                        key={n.id}
                        className={cn("flex gap-3 px-5 py-4", n.unread && "bg-blue-500/5")}
                      >
                        <span
                          className={cn(
                            "mt-1.5 size-2 shrink-0 rounded-full",
                            n.unread ? "bg-blue-500" : "bg-transparent"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <div className="text-sm">
                              <Sentence n={n} />
                            </div>
                            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                              {timeAgo(n.minutesAgo)}
                            </span>
                          </div>
                          {n.context && (
                            <div className="text-xs text-muted-foreground">{n.context}</div>
                          )}
                          {n.snippet && (
                            <p className="mt-2 rounded-md bg-muted p-3 text-sm">{n.snippet}</p>
                          )}
                          <div className="mt-2 flex gap-3 text-xs">
                            <Link
                              to={n.href}
                              onClick={() => {
                                feed.markRead(n.id);
                                setOpen(false);
                              }}
                              className="font-medium text-primary hover:underline"
                            >
                              {n.kind === "question" ? "Answer" : "Open"}
                            </Link>
                            {n.unread && (
                              <button
                                onClick={() => feed.markRead(n.id)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
