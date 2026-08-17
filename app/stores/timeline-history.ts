import { getNoteTypeMetadata, pxToFrame } from "~~/utils/timeline";
import { findOamBudgetViolations } from "~~/utils/oam-budget";
import {
  MAX_ACTIVE_NOTES,
  MAX_ACTIVE_NOTES_PER_ROW,
  MAX_NOTE_COUNT,
} from "~~/utils/constants";

import Modal from "~/components/Modal.vue";

export const useTimelineHistoryStore = defineStore("timelineHistory", () => {
  const beatmapState = useBeatmapStateStore();
  const timelineUi = useTimelineUiStore();
  const { currentFrame } = storeToRefs(useTimelineAudioStore());

  const overlay = useOverlay();

  /** The default number of frames it takes for a tap or reverse note to become fully charged. */
  const DEFAULT_CHARGE_FRAMES = 90;
  /** The default number of frames a hold note should be held for. */
  const DEFAULT_HOLD_FRAMES = 60;

  /** The maximum number of history entries to retain for undo/redo. */
  const MAX_ACTION_HISTORY = 200;

  /** Snapshots of the notes array taken before each mutating action. */
  const undoStack = ref<Note[][]>([]);
  /** Snapshots that were undone and can be redone. */
  const redoStack = ref<Note[][]>([]);

  /** Notes currently copied to the in-app clipboard. */
  const clipboard = ref<Note[]>([]);

  /**
   * Deep-clone a note array so history snapshots aren't impacted by mutations later on.
   *
   * @param list - The note list to clone.
   *
   * @returns The cloned note list.
   */
  function cloneNotes(list: Note[]): Note[] {
    return list.map((n) => ({ ...n }));
  }

  /**
   * Snapshot the current notes state onto the undo stack.
   *
   * Must be called prior to a mutation.
   */
  function pushUndo() {
    pushUndoSnapshot(cloneNotes(beatmapState.notes));
  }

  /**
   * Push a pre-captured snapshot onto the undo stack.
   *
   * Used for dragging/resizing, where the "before" state must be captured at the start of the interaction rather than immediately before committing it.
   *
   * @param snapshot - The notes state to record as the undo point.
   */
  function pushUndoSnapshot(snapshot: Note[]) {
    undoStack.value.push(snapshot);
    if (undoStack.value.length > MAX_ACTION_HISTORY) undoStack.value.shift();
    redoStack.value = [];
  }

  /** Revert to the previous state in the undo stack, if any. */
  function undo() {
    if (!undoStack.value.length) return;

    const prev = undoStack.value.pop()!;
    redoStack.value.push(cloneNotes(beatmapState.notes));
    beatmapState.notes = prev;

    timelineUi.clearSelection();
  }

  /** Switch back to a state that was previously undone, if any. */
  function redo() {
    if (!redoStack.value.length) return;

    const next = redoStack.value.pop()!;
    undoStack.value.push(cloneNotes(beatmapState.notes));
    beatmapState.notes = next;

    timelineUi.clearSelection();
  }

  /** Copy the currently selected notes to the clipboard. */
  function copySelected() {
    if (!timelineUi.selectedNoteIds.size) return;
    clipboard.value = cloneNotes(timelineUi.selectedNotesList);
  }

  /** Copy selected notes and delete them from the chart. */
  function cutSelected() {
    if (!timelineUi.selectedNoteIds.size) return;
    copySelected();
    deleteSelected();
  }

  /** Paste clipboard notes at the current playhead position. */
  function pasteClipboard() {
    if (!clipboard.value.length) return;

    pushUndo();

    const minFrame = Math.min(...clipboard.value.map((n) => n.peakFrame));
    const offset = currentFrame.value - minFrame;

    const pasted: Note[] = clipboard.value.map((n) =>
      clampNoteToTimeline({
        ...n,
        id: crypto.randomUUID(),
        peakFrame: Math.max(0, n.peakFrame + offset),
      }),
    );

    beatmapState.notes.push(...pasted);
    timelineUi.selectedNoteIds = new Set(pasted.map((n) => n.id));
  }

  /**
   * Delete a single note by ID.
   *
   * @param noteId - The ID of the note to delete.
   */
  function deleteNote(noteId: string) {
    pushUndo();

    const idx = beatmapState.notes.findIndex((n: Note) => n.id === noteId);
    if (idx !== -1) beatmapState.notes.splice(idx, 1);

    if (timelineUi.selectedNoteIds.has(noteId)) {
      const next = new Set(timelineUi.selectedNoteIds);
      next.delete(noteId);
      timelineUi.selectedNoteIds = next;
    }
  }

  /** Delete every currently selected note. */
  function deleteSelected() {
    if (!timelineUi.selectedNoteIds.size) return;

    pushUndo();

    const ids = timelineUi.selectedNoteIds;
    beatmapState.notes = beatmapState.notes.filter((n: Note) => !ids.has(n.id));
    timelineUi.clearSelection();
  }

  /**
   * Place a note at a given track-relative pixel position (that is, excluding the label column).
   *
   * @param trackX - The x-position within the timeline track, in pixels.
   * @param noteType - The type of note to place.
   * @param noteDirection - The note's direction.
   */
  async function placeNoteAt(
    trackX: number,
    noteType: NoteType,
    noteDirection: Direction | undefined,
  ) {
    const peakFrame = pxToFrame(
      trackX,
      timelineUi.pixelsPerFrame,
      timelineUi.snapFrames,
    );

    if (
      beatmapState.notes.some(
        (n: Note) => n.type === noteType && n.peakFrame === peakFrame,
      )
    )
      return;

    pushUndo();

    const noteMetadata = getNoteTypeMetadata(noteType);

    // We must check if the user actually selected a valid direction for their note type.
    // If not, we should make it fall back to the first valid direction.
    // (Only applies to tap and hold notes.)
    if (noteMetadata.directions?.length)
      if (!noteDirection || !noteMetadata.directions.includes(noteDirection))
        noteDirection = noteMetadata.directions[0];

    const note: Note = {
      id: crypto.randomUUID(),
      type: noteType,
      direction: noteDirection,
      speedModifier: 0, // 0 = don't modify
      gridIndex: 0,
      peakFrame,
      chargeFrames: DEFAULT_CHARGE_FRAMES,
      holdFrames: noteType === NoteType.HOLD ? DEFAULT_HOLD_FRAMES : 0,
    };

    const clampedNote = clampNoteToTimeline(note);

    const wouldExceedNoteLimit = beatmapState.notes.length >= MAX_NOTE_COUNT;
    const currentViolations = beatmapState.oamBudgetViolations;
    const newViolations = findOamBudgetViolations([
      ...beatmapState.notes,
      clampedNote,
    ]);

    const addsNewViolation = newViolations.length > currentViolations.length;

    const hasNewRowViolation = newViolations.some(
      (v) =>
        v.scope === "row" &&
        !currentViolations.some(
          (cv) => cv.frame === v.frame && cv.row === v.row,
        ),
    );

    if (wouldExceedNoteLimit || addsNewViolation) {
      await showLimitWarning(wouldExceedNoteLimit, hasNewRowViolation);
      return;
    }

    beatmapState.notes.push(clampedNote);
    timelineUi.selectOnly(clampedNote.id);
  }

  /**
   * Place a note at an exact grid cell and frame.
   *
   * Used by the playtester grid.
   *
   * @param gridIndex - The grid cell to place the note in.
   * @param frame - The exact peak frame to place the note at.
   * @param type - The note type to place.
   * @param direction - The direction, for types that support it.
   */
  async function placeNoteAtGrid(
    gridIndex: number,
    frame: number,
    type: NoteType,
    direction?: Direction,
  ) {
    const snapshot = cloneNotes(beatmapState.notes);

    const note: Note = clampNoteToTimeline({
      id: crypto.randomUUID(),
      type,
      direction,
      speedModifier: 0,
      gridIndex,
      peakFrame: frame,
      chargeFrames: DEFAULT_CHARGE_FRAMES,
      holdFrames: type === NoteType.HOLD ? DEFAULT_HOLD_FRAMES : undefined,
    });

    const wouldExceedNoteLimit = beatmapState.notes.length >= MAX_NOTE_COUNT;
    const currentViolations = beatmapState.oamBudgetViolations;
    const newViolations = findOamBudgetViolations([
      ...beatmapState.notes,
      note,
    ]);

    const addsNewViolation = newViolations.length > currentViolations.length;

    const hasNewRowViolation = newViolations.some(
      (v) =>
        v.scope === "row" &&
        !currentViolations.some(
          (cv) => cv.frame === v.frame && cv.row === v.row,
        ),
    );

    if (wouldExceedNoteLimit || addsNewViolation) {
      await showLimitWarning(wouldExceedNoteLimit, hasNewRowViolation);
      return;
    }

    beatmapState.notes.push(note);
    pushUndoSnapshot(snapshot);
  }

  /**
   * Clamp a note so that its full duration stays inside the timeline.
   *
   * This includes charge frames before the peak and hold frames after it.
   *
   * @param note - The note to clamp.
   *
   * @returns The clamped note.
   */
  function clampNoteToTimeline(note: Note): Note {
    const chargeFrames = note.chargeFrames ?? 0;
    const holdFrames = note.type === NoteType.HOLD ? (note.holdFrames ?? 0) : 0;

    let peakFrame = note.peakFrame;

    if (peakFrame - chargeFrames < 0) peakFrame = chargeFrames;

    if (peakFrame + holdFrames > beatmapState.totalFrames)
      peakFrame = beatmapState.totalFrames - holdFrames;

    peakFrame = Math.max(
      chargeFrames,
      Math.min(peakFrame, beatmapState.totalFrames - holdFrames),
    );

    return {
      ...note,
      peakFrame,
    };
  }

  /**
   * Shift every selected note's peak frame by a value.
   *
   * @param delta - The frame delta to move by.
   */
  function moveSelected(delta: number) {
    const timelineUi = useTimelineUiStore();
    const beatmapState = useBeatmapStateStore();

    if (timelineUi.selectedNoteIds.size === 0) return;

    const snapshot = cloneNotes(beatmapState.notes);
    let moved = false; // we need this to check if we actually moved anything after the loop
    // if not, we shouldn't add the action as a snapshot

    for (const note of beatmapState.notes) {
      if (!timelineUi.selectedNoteIds.has(note.id)) continue;

      const newFrame = Math.max(0, note.peakFrame + delta);
      if (newFrame === note.peakFrame) continue;

      Object.assign(
        note,
        clampNoteToTimeline({ ...note, peakFrame: newFrame }),
      );
      moved = true;
    }

    if (moved) pushUndoSnapshot(snapshot);
  }

  /** Show a warning popup when placing a note would exceed hardware limits. */
  async function showLimitWarning(
    exceedsNoteLimit: boolean,
    isRowViolation: boolean = false,
  ) {
    const modal = overlay.create(Modal);
    let title = "Sprite Limit Exceeded";

    let message = isRowViolation
      ? `Placing this note exceeds the ${MAX_ACTIVE_NOTES_PER_ROW}-note per row limit. The note has not been placed.`
      : `Placing this note exceeds the ${MAX_ACTIVE_NOTES}-note OAM limit. The note has not been placed.`;

    if (exceedsNoteLimit) {
      title = "Note Limit Exceeded";
      message = `Placing this note exceeds the ${MAX_NOTE_COUNT}-note limit.`;
    }

    await modal.open({
      title,
      message,
      buttons: [{ label: "OK", color: "primary" }],
    });
  }

  return {
    undoStack,
    redoStack,
    clipboard,
    cloneNotes,
    pushUndo,
    pushUndoSnapshot,
    undo,
    redo,
    copySelected,
    cutSelected,
    pasteClipboard,
    deleteNote,
    deleteSelected,
    placeNoteAt,
    placeNoteAtGrid,
    clampNoteToTimeline,
    moveSelected,
  };
});
