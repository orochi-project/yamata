import { MAP_SPACE_WIDTH, SCANLINE_PIXELS_PER_FRAME } from "./constants";
import { NoteType } from "../shared/utils/notes";

/** The scanline's exact state (position/direction) at a note's peak frame. */
export interface ScanlineCheckpoint {
  /** The scanline's x-position, in raw game pixels (0 to MAP_SPACE_WIDTH). */
  x: number;
  /** The scanline's direction of travel. */
  direction: 1 | -1;
}

/**
 * Advance a bouncing position by a distance.
 *
 * @param position - The starting position, in pixels.
 * @param direction - The starting direction (1 or -1).
 * @param distance - The distance to travel, in pixels.
 * @param left - The left boundary.
 * @param right - The right boundary.
 *
 * @returns The position and direction after traveling.
 */
function advance(
  position: number,
  direction: 1 | -1,
  distance: number,
  left: number,
  right: number,
): { position: number; direction: 1 | -1 } {
  const range = right - left;
  if (range <= 0) return { position: left, direction };

  const period = range * 2;
  const relativePosition = position - left;

  const unfolded =
    direction === 1 ? relativePosition : period - relativePosition;
  let mod = (unfolded + distance) % period;
  if (mod < 0) mod += period;

  const finalRelativePos = mod <= range ? mod : period - mod;
  const finalDirection: 1 | -1 = mod <= range ? 1 : -1;

  return { position: left + finalRelativePos, direction: finalDirection };
}

/**
 * Compute the scanline's exact position and direction at every note's peak
 * frame, in raw game pixel space (0 to MAP_SPACE_WIDTH).
 *
 * @param notes - The beatmap's notes.
 *
 * @returns A map from note ID to the scanline's checkpoint state at that
 * note's peak frame.
 */
export function computeScanlineCheckpoints(
  notes: any, // Note
): Map<string, ScanlineCheckpoint> {
  const results = new Map<string, ScanlineCheckpoint>();

  const left = 0;
  const right = MAP_SPACE_WIDTH;

  const sorted = [...notes].sort((a, b) => a.peakFrame - b.peakFrame);

  let position = left;
  let direction: 1 | -1 = 1;
  let speedModifier = 1;
  let lastFrame = 0;
  /** The frame at which an active freeze from a hold note ends. */
  let frozenUntil = 0;

  const checkpoints = new Set<number>();
  for (const note of sorted) {
    checkpoints.add(note.peakFrame);
    if (note.type === NoteType.HOLD)
      checkpoints.add(note.peakFrame + (note.holdFrames ?? 0));
  }

  const sortedCheckpoints = [...checkpoints].sort((a, b) => a - b);

  /**
   * Advance the simulation from the last frame to the target frame.
   *
   * @param targetFrame - The frame to advance to.
   */
  function advanceTo(targetFrame: number) {
    const segmentFrames = targetFrame - lastFrame;

    if (segmentFrames > 0 && frozenUntil <= lastFrame) {
      const distance =
        SCANLINE_PIXELS_PER_FRAME * speedModifier * segmentFrames;
      const result = advance(position, direction, distance, left, right);
      position = result.position;
      direction = result.direction;
    }

    lastFrame = targetFrame;
  }

  for (const checkpointFrame of sortedCheckpoints) {
    advanceTo(checkpointFrame);

    for (const note of sorted) {
      if (note.peakFrame !== checkpointFrame) continue;
      results.set(note.id, { x: Math.round(position), direction });
    }

    for (const note of sorted) {
      if (note.peakFrame !== checkpointFrame) continue;

      if (note.type === NoteType.REVERSE) direction = direction === 1 ? -1 : 1;
      if (note.type === NoteType.HOLD)
        frozenUntil = note.peakFrame + (note.holdFrames ?? 0);
      if (note.speedModifier !== 0) speedModifier = note.speedModifier;
    }
  }

  return results;
}
