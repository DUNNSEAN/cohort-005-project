import { noteDraftStatus } from "./lib/draft";

export type { NoteDraftStatus } from "./lib/draft";

/**
 * What the Note editor on the Lesson page shows about the Student's draft:
 * the character count against the limit, whether it has unsaved changes, and
 * whether Save should be enabled. `savedBody` is the stored Note body, or
 * null when the Student has not written one.
 */
export const describeNoteDraft = noteDraftStatus;
