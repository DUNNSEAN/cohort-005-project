import { useState } from "react";
import { Form, useFetcher } from "react-router";
import {
  Bell,
  BellOff,
  MessageCircleQuestion,
  MessageSquareReply,
  Receipt,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { NotificationKind, UserRole } from "~/db/schema";
import { cn, formatRelativeTime } from "~/lib/utils";
import type { NotificationItem } from "~/lib/notifications.server";
import { useUnreadCountPolling } from "./use-unread-count-polling";

export interface NotificationBellProps {
  unreadCount: number;
  items: NotificationItem[];
  role: UserRole;
}

// One icon per kind.
const kindIcons: Record<NotificationKind, LucideIcon> = {
  [NotificationKind.DiscussionReply]: MessageSquareReply,
  [NotificationKind.DiscussionQuestion]: MessageCircleQuestion,
  [NotificationKind.RefundDecision]: Receipt,
  [NotificationKind.Enrollment]: UserPlus,
  [NotificationKind.FirstRating]: Star,
};

// Discussion items name their course and lesson on a second line under the
// quote. The rest name the course in the sentence and stay on one line.
const showsContextLine: Record<NotificationKind, boolean> = {
  [NotificationKind.DiscussionReply]: true,
  [NotificationKind.DiscussionQuestion]: true,
  [NotificationKind.RefundDecision]: false,
  [NotificationKind.Enrollment]: false,
  [NotificationKind.FirstRating]: false,
};

/** The bell in the sidebar header, with its popover Notification Feed. */
export function NotificationBell({
  unreadCount,
  items,
  role,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  useUnreadCountPolling(unreadCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Notifications"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative ml-auto rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        <Bell className="size-4" />
        <UnreadBadge count={unreadCount} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className="fixed left-[13.5rem] top-2 z-50 w-96 rounded-lg border bg-popover text-popover-foreground shadow-xl"
          >
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && <MarkAllReadButton />}
            </div>
            {items.length === 0 ? (
              <EmptyState role={role} />
            ) : (
              <ul className="max-h-[28rem] divide-y overflow-y-auto">
                {items.map((item) => (
                  <li key={item.id}>
                    <FeedItem item={item} onOpen={() => setOpen(false)} />
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

/** Shown only while anything is unread; the layout reloads the count after. */
function MarkAllReadButton() {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" action="/api/notifications/read-all">
      <button
        type="submit"
        disabled={fetcher.state !== "idle"}
        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
      >
        Mark all read
      </button>
    </fetcher.Form>
  );
}

/** Says what the person would be notified about, by role. */
function EmptyState({ role }: { role: UserRole }) {
  const about =
    role === UserRole.Instructor
      ? "You'll hear about new Discussion Questions, Discussion Replies, Enrollments and first ratings on your courses."
      : "You'll hear about Discussion Replies to your posts and Refund Request decisions.";
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <BellOff className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">You're all caught up</p>
      <p className="text-xs text-muted-foreground">{about}</p>
    </div>
  );
}

function UnreadBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Clicking an item marks it read and goes to what it's about. */
function FeedItem({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: () => void;
}) {
  const Icon = kindIcons[item.kind];
  const unread = !item.read;

  return (
    <Form
      method="post"
      action={`/api/notifications/${item.id}/read`}
      onSubmit={onOpen}
    >
      <input type="hidden" name="redirectTo" value={item.href} />
      <button
        type="submit"
        className={cn(
          "flex w-full gap-3 px-4 py-3 text-left hover:bg-muted/60",
          unread && "bg-primary/5"
        )}
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-sm leading-snug",
              !showsContextLine[item.kind] && "truncate"
            )}
          >
            {item.actorName && (
              <span className="font-semibold">{item.actorName} </span>
            )}
            {item.action}
          </div>
          {item.quote && (
            <div className="mt-1 line-clamp-2 border-l-2 pl-2 text-xs text-muted-foreground">
              {item.quote}
            </div>
          )}
          {showsContextLine[item.kind] && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {item.courseTitle}
              {item.lessonTitle && ` · ${item.lessonTitle}`}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className="whitespace-nowrap text-xs text-muted-foreground"
            suppressHydrationWarning
          >
            {formatRelativeTime(item.createdAt)}
          </span>
          {unread && (
            <span
              className="size-2 rounded-full bg-blue-500"
              aria-label="Unread"
            />
          )}
        </div>
      </button>
    </Form>
  );
}
