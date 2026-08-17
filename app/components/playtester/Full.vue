<script setup lang="ts">
import { BASE_CROSSING_SECONDS, FRAMES_PER_SECOND } from "~~/utils/constants";

import mapBackground from "~/assets/res/backgrounds/map-background.png";

const beatmapState = useBeatmapStateStore();
const timelineUi = useTimelineUiStore();
const timelineHistory = useTimelineHistoryStore();
const playtesterUi = usePlaytesterUiStore();
const { currentFrame } = storeToRefs(useTimelineAudioStore());

/** The number of grid rows to display. */
const ROWS = 5;
/** The number of grid columns to display. */
const COLUMNS = 8;
/** The top-left corner of the grid, as a fraction (0-1) of the rendered image size. */
const ORIGIN = { x: 1 / 10, y: 5 / 32 };
/** The bottom-right corner of the grid, as a fraction (0-1) of the rendered image size. */
const END = { x: 9 / 10, y: 27 / 32 };

/** The left boundary on which the scanline's direction flips. */
const SCANLINE_BOUNDARY_LEFT = { x: 9 / 160 };
/** The right boundary on which the scanline's direction flips. */
const SCANLINE_BOUNDARY_RIGHT = { x: 152 / 160 };

/** The top of the visible scanline, as a fraction (0-1) of the image height. */
const SCANLINE_CLIP_TOP = 1 / 15;
/** The bottom of the visible scanline, as a fraction (0-1) of the image height. */
const SCANLINE_CLIP_BOTTOM = 14 / 15;

const scanlineBox = computed(() => ({
  top: SCANLINE_CLIP_TOP * imgSize.value.height,
  height: (SCANLINE_CLIP_BOTTOM - SCANLINE_CLIP_TOP) * imgSize.value.height,
}));

/** The map background image. */
const imgElement = ref<HTMLImageElement>();
/** The rendered size of the image, in pixels. */
const imgSize = ref({ width: 0, height: 0 });

/** The beatmap notes sorted by peak frame in ascending order. */
const beatmapNotesSorted = computed(() =>
  [...beatmapState.notes].sort((a, b) => a.peakFrame - b.peakFrame),
);

let observer: ResizeObserver | undefined;

/**
 * Advance a bouncing position by a distance.
 *
 * @param pos - The starting position, in pixels.
 * @param dir - The starting direction (1 or -1).
 * @param dist - The distance to travel, in pixels.
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

/** The scanline state at every checkpoint frame. */
const scanlineCheckpoints = computed(() => {
  const left = scanBounds.value.left;
  const right = scanBounds.value.right;

  let position = left;
  let direction: 1 | -1 = 1;
  let speedModifier = 1;
  let lastFrame = 0;
  let frozenUntil = 0;

  const checkpointFrames = new Set<number>([0]);
  for (const note of beatmapNotesSorted.value) {
    checkpointFrames.add(note.peakFrame);
    if (note.type === NoteType.HOLD)
      checkpointFrames.add(note.peakFrame + (note.holdFrames ?? 0));
  }

  const sorted = [...checkpointFrames].sort((a, b) => a - b);

  const states: {
    frame: number;
    position: number;
    direction: 1 | -1;
    speedModifier: number;
    frozenUntil: number;
  }[] = [];

  function advanceTo(targetFrame: number) {
    const segmentFrames = targetFrame - lastFrame;

    if (segmentFrames > 0 && frozenUntil <= lastFrame) {
      const distance = stepPerFrame.value * speedModifier * segmentFrames;
      const result = advance(position, direction, distance, left, right);
      position = result.position;
      direction = result.direction;
    }

    lastFrame = targetFrame;
  }

  for (const checkpointFrame of sorted) {
    advanceTo(checkpointFrame);

    for (const note of beatmapNotesSorted.value) {
      if (note.peakFrame !== checkpointFrame) continue;

      if (note.type === NoteType.REVERSE) direction = direction === 1 ? -1 : 1;
      if (note.type === NoteType.HOLD)
        frozenUntil = note.peakFrame + (note.holdFrames ?? 0);
      if (note.speedModifier !== 0) speedModifier = note.speedModifier;
    }

    states.push({
      frame: checkpointFrame,
      position,
      direction,
      speedModifier,
      frozenUntil,
    });
  }

  return states;
});

/**
 * The scanline's position and direction at the current frame.
 *
 * This uses binary search because replaying the entire song every frame causes extreme lag further into the beatmap.
 */
const scanlineState = computed<{ x: number; direction: 1 | -1 }>(() => {
  const left = scanBounds.value.left;
  const right = scanBounds.value.right;
  const checkpoints = scanlineCheckpoints.value;

  let low = 0;
  let high = checkpoints.length - 1;
  let idx = -1;

  // search for the scanline checkpoint at the current frame
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (checkpoints[mid]!.frame <= currentFrame.value) {
      idx = mid;
      low = mid + 1;
    } else high = mid - 1;
  }

  const base =
    idx >= 0
      ? checkpoints[idx]!
      : {
          frame: 0,
          position: left,
          direction: 1 as const,
          speedModifier: 1,
          frozenUntil: 0,
        };

  const segmentFrames = currentFrame.value - base.frame;

  if (segmentFrames <= 0 || base.frozenUntil > base.frame)
    return { x: base.position, direction: base.direction };

  const distance = stepPerFrame.value * base.speedModifier * segmentFrames;
  const result = advance(base.position, base.direction, distance, left, right);

  return { x: result.position, direction: result.direction };
});

/**
 * The scanline's x-position.
 *
 * Derived from the current frame so that it adapts to the playhead position.
 */
const scanlineX = computed(() => scanlineState.value.x);

/** The boundaries for the scan line. */
const scanBounds = computed(() => ({
  left: SCANLINE_BOUNDARY_LEFT.x * imgSize.value.width,
  right: SCANLINE_BOUNDARY_RIGHT.x * imgSize.value.width,
}));

/** The horizontal step, in pixels, per frame. */
const stepPerFrame = computed(() => {
  const distance = scanBounds.value.right - scanBounds.value.left;
  return distance / (BASE_CROSSING_SECONDS * FRAMES_PER_SECOND);
});

/** The pixel bounding box of the grid. */
const gridBox = computed(() => {
  const left = ORIGIN.x * imgSize.value.width;
  const top = ORIGIN.y * imgSize.value.height;
  const width = (END.x - ORIGIN.x) * imgSize.value.width;
  const height = (END.y - ORIGIN.y) * imgSize.value.height;
  return { left, top, width, height };
});

/** The list of grid cells with their pixel position/size and index. */
const cells = computed(() => {
  const cellWidth = gridBox.value.width / COLUMNS;
  const cellHeight = gridBox.value.height / ROWS;

  const list: { index: number; left: number; top: number }[] = [];

  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLUMNS; c++)
      list.push({
        index: r * COLUMNS + c,
        left: c * cellWidth,
        top: r * cellHeight,
      });

  return { list, cellWidth, cellHeight };
});

/**
 * Map the grid index to a currently active note with its properties.
 *
 * Covers both the charging window and, for hold notes, the hold window that follows it.
 */
const activeNoteByIndex = computed(() => {
  const map = new Map<
    number,
    { note: Note; chargeProgress: number; holdProgress?: number }
  >();

  for (const note of beatmapState.notes) {
    const chargeFrames = note.chargeFrames ?? 0;
    const startFrame = note.peakFrame - chargeFrames;
    const holdFrames = note.type === NoteType.HOLD ? (note.holdFrames ?? 0) : 0;
    const endFrame = note.peakFrame + holdFrames;

    const isActive =
      currentFrame.value >= startFrame && currentFrame.value < endFrame;

    if (!isActive) continue;

    const chargeProgress = chargeFrames
      ? Math.min(1, (currentFrame.value - startFrame) / chargeFrames)
      : 1;

    const holdProgress =
      note.type === NoteType.HOLD && holdFrames
        ? Math.max(
            0,
            Math.min(1, (currentFrame.value - note.peakFrame) / holdFrames),
          )
        : undefined;

    map.set(note.gridIndex, { note, chargeProgress, holdProgress });
  }

  return map;
});

/**
 * Place a note at this grid cell using the toolbar's active type/direction, at the current frame.
 *
 * @param gridIndex - The clicked cell's index.
 */
function placeNoteAtCell(gridIndex: number) {
  timelineHistory.placeNoteAtGrid(
    gridIndex,
    currentFrame.value,
    timelineUi.activeType,
    timelineUi.activeType === NoteType.TAP
      ? timelineUi.activeDirection
      : undefined,
  );
}

onMounted(() => {
  if (!imgElement.value) return;

  observer = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;

    imgSize.value = {
      width: entry.contentRect.width,
      height: entry.contentRect.height,
    };
  });

  observer.observe(imgElement.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <div class="overflow-x-auto overflow-y-hidden flex gap-4 w-full h-full">
    <div class="relative shrink-0 mx-auto h-full">
      <!-- background -->
      <img ref="imgElement" class="h-full" :src="mapBackground" />

      <!-- grid -->
      <div
        class="absolute"
        :class="
          playtesterUi.showGrid ? 'border-t border-l border-blue-400/50' : ''
        "
        :style="{
          left: gridBox.left + 'px',
          top: gridBox.top + 'px',
          width: gridBox.width + 'px',
          height: gridBox.height + 'px',
        }"
      >
        <div
          v-for="cell in cells.list"
          :key="cell.index"
          class="group cursor-pointer absolute"
          :class="
            playtesterUi.showGrid
              ? 'border-r border-b border-blue-400/50 hover:ring-2 hover:ring-inset hover:ring-blue-300 hover:bg-blue-400/20'
              : ''
          "
          :style="{
            left: cell.left + 'px',
            top: cell.top + 'px',
            width: cells.cellWidth + 'px',
            height: cells.cellHeight + 'px',
          }"
          @click="placeNoteAtCell(cell.index)"
        >
          <div
            class="z-30 pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 opacity-0 text-xs text-white whitespace-nowrap rounded bg-black/80 group-hover:opacity-100"
          >
            {{ cell.index }}
          </div>

          <div
            v-if="activeNoteByIndex.has(cell.index)"
            class="pointer-events-none absolute inset-0"
            style="will-change: transform"
          >
            <PlaytesterNote
              :note="activeNoteByIndex.get(cell.index)!.note"
              :charge-progress="
                activeNoteByIndex.get(cell.index)!.chargeProgress
              "
              :hold-progress="activeNoteByIndex.get(cell.index)!.holdProgress"
              :cell-width="cells.cellWidth"
              :cell-height="cells.cellHeight"
            />
          </div>
        </div>
      </div>

      <!-- scanline -->
      <div
        class="absolute pointer-events-none bg-white"
        :style="{
          left: 0,
          top: `${scanlineBox.top}px`,
          width: '4px',
          height: `${scanlineBox.height}px`,
          transform: `translate3d(${scanlineX - 4}px, 0, 0)`,
          willChange: 'transform',
        }"
      />
    </div>
  </div>
</template>
