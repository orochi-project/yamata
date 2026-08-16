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

/** The number of grid rows on the game grid. */
export const GRID_ROWS = 5;
/** The number of grid columns on the game grid. */
export const GRID_COLS = 8;

/**
 * The number of frames a missed note lingers for.
 *
 * Only applies to tap and reverse notes.
 */
export const NOTE_MISS_LINGER_FRAMES = 30;

/** The Game Boy's limit on hardware sprites existing in OAM at once. */
export const OAM_HARDWARE_SPRITE_LIMIT = 40;
/** The Game Boy's limit on hardware sprites that may appear on any single hardware scanline (raster line) before the rest are skipped. */
export const OAM_PER_SCANLINE_LIMIT = 10;

/** The number hardware sprites used to draw the scanline sprite. */
export const SCANLINE_OAM_COST = 7;
/** The number of the scanline sprite's stacked tiles that can exist on the same hardware scanline (raster line). */
export const SCANLINE_OAM_COST_PER_ROW = 1;
/** The number of 8x16 hardware sprites used to draw one note. */
export const NOTE_OAM_COST = 2;

/** The maximum number of notes that may exist at once, anywhere on screen. */
export const MAX_ACTIVE_NOTES = Math.floor(
  (OAM_HARDWARE_SPRITE_LIMIT - SCANLINE_OAM_COST) / NOTE_OAM_COST,
);

/** The maximum number of notes that may exist at the same time on the same grid row. */
export const MAX_ACTIVE_NOTES_PER_ROW = Math.floor(
  (OAM_PER_SCANLINE_LIMIT - SCANLINE_OAM_COST_PER_ROW) / NOTE_OAM_COST,
);
