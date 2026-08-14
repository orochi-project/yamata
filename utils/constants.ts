/**
 * The exact FPS of the Game Boy Color.
 *
 * The quotient should be (approximately) 59.7275.
 */
export const FRAMES_PER_SECOND = 262144 / 4389;

/**
 * The number of tiles on the game grid.
 *
 * Each grid box is an 8x8 square.
 */
export const GRID_TILE_COUNT = 40;

/** The height of each timeline row, in pixels. */
export const ROW_HEIGHT = 64;
/** The height of the ruler strip above the timeline rows, in pixels. */
export const RULER_HEIGHT = 32;
/** The left padding of the timeline view. */
export const VIEW_PADDING_LEFT = 16;

/** The width of the playable space in the map. */
export const MAP_SPACE_WIDTH = 142;
/** The number of pixels the scanline moves per frame. */
export const SCANLINE_PIXELS_PER_FRAME = 1;
/** The base number of seconds a full sweep should take. */
export const BASE_CROSSING_SECONDS =
  (SCANLINE_PIXELS_PER_FRAME * MAP_SPACE_WIDTH) / FRAMES_PER_SECOND;

/** The width of a note, in pixels. */
export const NOTE_WIDTH = 16;
/** The height of a note, in pixels. */
export const NOTE_HEIGHT = 16;

/** The maximum allowed number of notes in one beatmap. */
export const MAX_NOTE_COUNT = 1600;
