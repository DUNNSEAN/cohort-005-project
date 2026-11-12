import { useEffect, useRef } from "react";
import { useFetcher, useRevalidator } from "react-router";
import type { loader } from "~/routes/api.notifications.unread-count";

const POLL_INTERVAL_MS = 60_000;

/**
 * Keeps the bell fresh without navigation: polls the unread count every
 * minute and when the window regains focus. When the count no longer matches
 * what the layout loader gave us, it revalidates, so the badge and the feed
 * update together. Navigation already refreshes both through the loader.
 */
export function useUnreadCountPolling(loaderCount: number) {
  const fetcher = useFetcher<typeof loader>();
  const revalidator = useRevalidator();

  // Refs so the effects below don't re-subscribe on every render.
  const load = useRef(fetcher.load);
  load.current = fetcher.load;
  const revalidate = useRef(revalidator.revalidate);
  revalidate.current = revalidator.revalidate;
  const latestLoaderCount = useRef(loaderCount);
  latestLoaderCount.current = loaderCount;

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === "hidden") return;
      void load.current("/api/notifications/unread-count");
    };
    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    window.addEventListener("focus", poll);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
    };
  }, []);

  useEffect(() => {
    const polledCount = fetcher.data?.unreadCount;
    if (polledCount === undefined) return;
    if (polledCount !== latestLoaderCount.current) void revalidate.current();
  }, [fetcher.data]);
}
