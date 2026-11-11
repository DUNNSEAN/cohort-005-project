// PROTOTYPE — throwaway. Placeholder Notifications for the bell/feed prototype
// (wayfinder ticket "Where does the bell go, and what does the notification feed look like?").
// Events come from the decided event list; nothing here touches the database.

export type Audience = "student" | "instructor";

export type NotificationKind =
  | "reply"
  | "refund-approved"
  | "refund-declined"
  | "question"
  | "course-reply"
  | "enrollment"
  | "first-rating";

export interface ProtoNotification {
  id: string;
  kind: NotificationKind;
  actor: string | null; // who did it; null for system-ish events
  headline: string; // the sentence, without the actor name
  courseTitle: string;
  context: string | null; // lesson title, seat source, etc.
  snippet: string | null; // quoted text for Replies / Questions
  minutesAgo: number;
  unread: boolean;
  href: string;
}

const COURSE = "Introduction to TypeScript";
const COURSE_2 = "React Patterns in Practice";

export const studentNotifications: ProtoNotification[] = [
  {
    id: "s1",
    kind: "reply",
    actor: "Priya Shah",
    headline: "answered your Question",
    courseTitle: COURSE,
    context: "Lesson 3: Narrowing with type guards",
    snippet:
      "Good catch — `in` narrowing only works on object types, so the string case falls through. Try a `typeof` check first.",
    minutesAgo: 12,
    unread: true,
    href: "/courses",
  },
  {
    id: "s2",
    kind: "reply",
    actor: "Sam Lee",
    headline: "replied to your Comment",
    courseTitle: COURSE,
    context: "Lesson 5: Generics",
    snippet: "Same thing tripped me up. The constraint has to go on T, not on the param.",
    minutesAgo: 95,
    unread: true,
    href: "/courses",
  },
  {
    id: "s3",
    kind: "refund-approved",
    actor: null,
    headline: "Your Refund Request was approved",
    courseTitle: COURSE_2,
    context: null,
    snippet: null,
    minutesAgo: 60 * 26,
    unread: false,
    href: "/dashboard",
  },
  {
    id: "s4",
    kind: "reply",
    actor: "Priya Shah",
    headline: "replied to your Question",
    courseTitle: COURSE,
    context: "Lesson 1: Why TypeScript?",
    snippet: "Following up — I added a short appendix video on strict mode.",
    minutesAgo: 60 * 24 * 4,
    unread: false,
    href: "/courses",
  },
  {
    id: "s5",
    kind: "refund-declined",
    actor: null,
    headline: "Your Refund Request was declined",
    courseTitle: "Design Systems 101",
    context: "Past the 30-day refund window",
    snippet: null,
    minutesAgo: 60 * 24 * 9,
    unread: false,
    href: "/dashboard",
  },
];

export const instructorNotifications: ProtoNotification[] = [
  {
    id: "i1",
    kind: "question",
    actor: "Liam O'Connor",
    headline: "asked a Question",
    courseTitle: COURSE,
    context: "Lesson 3: Narrowing with type guards",
    snippet: "Why does `in` narrowing not work when the union includes a string?",
    minutesAgo: 4,
    unread: true,
    href: "/instructor/questions",
  },
  {
    id: "i2",
    kind: "enrollment",
    actor: "Jordan Kim",
    headline: "enrolled",
    courseTitle: COURSE,
    context: "Individual Purchase",
    snippet: null,
    minutesAgo: 38,
    unread: true,
    href: "/instructor",
  },
  {
    id: "i3",
    kind: "course-reply",
    actor: "Sam Lee",
    headline: "replied in a discussion",
    courseTitle: COURSE,
    context: "Lesson 5: Generics",
    snippet: "Same thing tripped me up. The constraint has to go on T, not on the param.",
    minutesAgo: 95,
    unread: true,
    href: "/instructor",
  },
  {
    id: "i4",
    kind: "enrollment",
    actor: "Alex Rivera",
    headline: "enrolled",
    courseTitle: COURSE,
    context: "Claimed Seat · Acme Corp",
    snippet: null,
    minutesAgo: 60 * 5,
    unread: true,
    href: "/instructor",
  },
  {
    id: "i5",
    kind: "first-rating",
    actor: "Chen Wu",
    headline: "gave your course its first rating — ★★★★☆",
    courseTitle: COURSE_2,
    context: null,
    snippet: null,
    minutesAgo: 60 * 24 * 2,
    unread: false,
    href: "/instructor/analytics",
  },
  {
    id: "i6",
    kind: "question",
    actor: "Maya Patel",
    headline: "asked a Question",
    courseTitle: COURSE_2,
    context: "Lesson 2: Compound components",
    snippet: "Is context the only way to share state between compound children?",
    minutesAgo: 60 * 24 * 3,
    unread: false,
    href: "/instructor/questions",
  },
];

export function timeAgo(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (60 * 24))}d`;
}

export function isToday(n: ProtoNotification) {
  return n.minutesAgo < 60 * 24;
}
