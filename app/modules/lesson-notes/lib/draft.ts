import { MAX_NOTE_LENGTH } from "~/lib/notes";

export type NoteDraftStatus = {
  /** Characters in the draft as it will be saved: surrounding space trimmed. */
  length: number;
  max: number;
  tooLong: boolean;
  /** The draft differs from what is saved. */
  unsaved: boolean;
  canSave: boolean;
};

export function noteDraftStatus(
  draft: string,
  savedBody: string | null
): NoteDraftStatus {
  const trimmed = draft.trim();
  const length = trimmed.length;
  const tooLong = length > MAX_NOTE_LENGTH;
  const unsaved = trimmed !== (savedBody ?? "");
  return {
    length,
    max: MAX_NOTE_LENGTH,
    tooLong,
    unsaved,
    canSave: unsaved && length > 0 && !tooLong,
  };
}
