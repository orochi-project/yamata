import {
  GRID_COLS,
  GRID_ROWS,
  MAX_ACTIVE_NOTES,
  MAX_ACTIVE_NOTES_PER_ROW,
  NOTE_MISS_LINGER_FRAMES,
} from "./constants";
import { NoteType } from "../shared/utils/notes";

/** The frame range a note occupies OAM budget for. */
interface NoteWindow {
  /** The note. */
  note: Note;
  /** The row number the note is on. */
  row: number;
  /** The frame the note is spawned. */
  start: number;
  /** The last frame the note is still resident in OAM, worst case. */
  end: number;
}

/** A point where the OAM budget is exceeded. */
export interface OamBudgetViolation {
  /** The frame at which the violation occurs. */
  frame: number;
  /** Whether this is the global OAM budget or a single row's 10-per-scanline budget. */
  scope: "total" | "row";
  /**
   * The grid row.
   *
   * Only applies when the scope is "row".
   */
  row?: number;
  /** The number of notes that are active at this frame or row. */
  activeCount: number;
  /** The budget that was exceeded. */
  limit: number;
  /** The array of notes responsible for the overlap. */
  notes: Note[];
}

/**
 * Calculate the frame window a note occupies OAM budget for.
 *
 * This assumes the worst case (i.e., a tap or reverse note that is missed and lingers in its destruction period).
 *
 * @param note - The note to compute the window for.
 *
 * @returns The note's worst-case active window and grid row.
 */
function getNoteWindow(note: Note): NoteWindow {
  const appearFrame = note.peakFrame - note.chargeFrames;
  const row = Math.floor(note.gridIndex / GRID_COLS);

  const end =
    note.type === NoteType.HOLD
      ? note.peakFrame + (note.holdFrames ?? 0) + 1 // since hold notes are destroyed the frame after their hold ends, we have to add 1
      : note.peakFrame + NOTE_MISS_LINGER_FRAMES;

  return { note, row, start: appearFrame, end };
}

/**
 * Check a beatmap's notes for violations of the Game Boy's OAM budget.
 *
 * This assumes every tap and reverse note is missed, since the editor cannot actually predict if they will actually be hit or missed in the game.
 *
 * @param notes - The beatmap's notes.
 *
 * @returns The points in time at which the budget is exceeded.
 */
export function findOamBudgetViolations(notes: Note[]): OamBudgetViolation[] {
  const noteWindows = notes.map(getNoteWindow);

  interface Event {
    frame: number;
    delta: 1 | -1;
    window: NoteWindow;
  }

  const events: Event[] = [];

  for (const noteWindow of noteWindows) {
    events.push({ frame: noteWindow.start, delta: 1, window: noteWindow });
    events.push({ frame: noteWindow.end + 1, delta: -1, window: noteWindow });
  }

  events.sort((a, b) => a.frame - b.frame || a.delta - b.delta);

  const budgetViolations: OamBudgetViolation[] = [];

  const active = new Set<NoteWindow>();
  const activeByRow: Set<NoteWindow>[] = Array.from(
    { length: GRID_ROWS },
    () => new Set<NoteWindow>(),
  );

  let i = 0;
  while (i < events.length) {
    const frame = events[i]!.frame;

    while (i < events.length && events[i]!.frame === frame) {
      const { delta, window } = events[i]!;

      if (delta === 1) {
        active.add(window);
        activeByRow[window.row]!.add(window);
      } else {
        active.delete(window);
        activeByRow[window.row]!.delete(window);
      }

      ++i;
    }

    if (active.size > MAX_ACTIVE_NOTES)
      budgetViolations.push({
        frame,
        scope: "total",
        activeCount: active.size,
        limit: MAX_ACTIVE_NOTES,
        notes: [...active].map((w) => w.note),
      });

    for (let row = 0; row < GRID_ROWS; ++row) {
      const rowActive = activeByRow[row]!;

      if (rowActive.size > MAX_ACTIVE_NOTES_PER_ROW)
        budgetViolations.push({
          frame,
          scope: "row",
          row,
          activeCount: rowActive.size,
          limit: MAX_ACTIVE_NOTES_PER_ROW,
          notes: [...rowActive].map((w) => w.note),
        });
    }
  }

  return budgetViolations;
}
