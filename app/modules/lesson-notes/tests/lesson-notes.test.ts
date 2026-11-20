import { describe, it, expect } from "vitest";
import { describeNoteDraft } from "../index";
import { MAX_NOTE_LENGTH } from "~/lib/notes";

describe("describeNoteDraft", () => {
  it("cannot save an empty draft when there is no Note yet", () => {
    expect(describeNoteDraft("", null)).toEqual({
      length: 0,
      max: MAX_NOTE_LENGTH,
      tooLong: false,
      unsaved: false,
      canSave: false,
    });
  });

  it("cannot save a whitespace-only draft", () => {
    const status = describeNoteDraft("   \n ", null);
    expect(status.length).toBe(0);
    expect(status.canSave).toBe(false);
  });

  it("can save a new draft with text in it", () => {
    const status = describeNoteDraft("REST is stateless", null);
    expect(status).toMatchObject({ length: 17, unsaved: true, canSave: true });
  });

  it("has nothing to save when the draft matches the saved Note", () => {
    const status = describeNoteDraft("REST is stateless", "REST is stateless");
    expect(status).toMatchObject({ unsaved: false, canSave: false });
  });

  it("ignores surrounding space when comparing with the saved Note", () => {
    const status = describeNoteDraft(
      "  REST is stateless\n",
      "REST is stateless"
    );
    expect(status).toMatchObject({
      length: 17,
      unsaved: false,
      canSave: false,
    });
  });

  it("has unsaved changes once the draft differs from the saved Note", () => {
    const status = describeNoteDraft("REST is stateful", "REST is stateless");
    expect(status).toMatchObject({ unsaved: true, canSave: true });
  });

  it("cannot save a cleared draft over an existing Note", () => {
    const status = describeNoteDraft("  ", "REST is stateless");
    expect(status).toMatchObject({ length: 0, unsaved: true, canSave: false });
  });

  it("allows a draft of exactly the limit", () => {
    const status = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH), null);
    expect(status).toMatchObject({ tooLong: false, canSave: true });
  });

  it("refuses a draft one character over the limit", () => {
    const status = describeNoteDraft("a".repeat(MAX_NOTE_LENGTH + 1), null);
    expect(status).toMatchObject({
      length: MAX_NOTE_LENGTH + 1,
      tooLong: true,
      unsaved: true,
      canSave: false,
    });
  });
});
