// PROTOTYPE — throwaway. In-memory feed state shared by every variant.
// Reads ?as=student|instructor (defaults from the DevUI user's role) and ?empty=1.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  type Audience,
  type ProtoNotification,
  studentNotifications,
  instructorNotifications,
} from "./data";

export function useProtoFeed(role: string | null) {
  const [params] = useSearchParams();
  const audience: Audience =
    (params.get("as") as Audience | null) ??
    (role === "instructor" ? "instructor" : "student");
  const empty = params.get("empty") === "1";

  const [items, setItems] = useState<ProtoNotification[]>([]);

  useEffect(() => {
    setItems(
      empty
        ? []
        : (audience === "instructor"
            ? instructorNotifications
            : studentNotifications
          ).map((n) => ({ ...n }))
    );
  }, [audience, empty]);

  const unreadCount = items.filter((n) => n.unread).length;

  return {
    audience,
    items,
    unreadCount,
    markRead: (id: string) =>
      setItems((xs) => xs.map((n) => (n.id === id ? { ...n, unread: false } : n))),
    markAllRead: () => setItems((xs) => xs.map((n) => ({ ...n, unread: false }))),
  };
}

export type ProtoFeed = ReturnType<typeof useProtoFeed>;
