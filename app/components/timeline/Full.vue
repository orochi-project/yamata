<script setup lang="ts">
import {
  RULER_HEIGHT,
  ROW_HEIGHT,
  VIEW_PADDING_LEFT,
} from "~~/utils/constants";
import { frameToPx } from "~~/utils/timeline";

const beatmapState = useBeatmapStateStore();
const timelineUi = useTimelineUiStore();

/** The total width, in pixels, of the timeline based on the number of frames. */
const timelineWidth = computed(() =>
  frameToPx(beatmapState.totalFrames, timelineUi.pixelsPerFrame),
);

/** The timeline scrolling container. */
const scrollElement = ref<HTMLElement>();
/** The rows container element. Used as the coordinate origin for rectangle selection. */
const rowsContainer = ref<HTMLElement>();

const timelineInteractions = useTimelineInteractions(rowsContainer);
const timelineAudio = useTimelineAudio(scrollElement);
const { currentFrame, isPlaying } = storeToRefs(useTimelineAudioStore());

useTimelineKeyboard();

/** The horizontal pixel range currently visible. */
const visibleRange = ref({ left: 0, right: 0 });

/** Recalculate the visible pixel range from the scroll container's current scroll position. */
function updateVisibleRange() {
  if (!scrollElement.value) return;

  const buffer = scrollElement.value.clientWidth;
  const newLeft = Math.max(0, scrollElement.value.scrollLeft - buffer);
  const newRight =
    scrollElement.value.scrollLeft + scrollElement.value.clientWidth + buffer;

  const threshold = buffer / 4;
  if (
    Math.abs(newLeft - visibleRange.value.left) < threshold &&
    Math.abs(newRight - visibleRange.value.right) < threshold
  )
    return;

  visibleRange.value = { left: newLeft, right: newRight };
}

/** The height of the timeline panel, in pixels. */
const panelHeight = ref(284);

/**
 * Start resizing the timeline panel.
 *
 * @param e - The pointer event properties.
 */
function onPanelResizeDown(e: PointerEvent) {
  const startY = e.clientY;
  const origHeight = panelHeight.value;

  /**
   * Move the panel based on the height.
   *
   * @param ev - The pointer event properties.
   */
  function move(ev: PointerEvent) {
    panelHeight.value = Math.min(
      284,
      Math.max(8, origHeight + (startY - ev.clientY)),
    );
  }

  /** Stop listening to pointer events on the timeline panel. */
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/**
 * Pixel spacing for minor and major grid lines.
 *
 * Used by track rows to build a CSS background.
 */
const gridSpacing = computed(() => {
  let minorStep = 12;

  while (
    frameToPx(minorStep, timelineUi.pixelsPerFrame) < 12 &&
    minorStep < beatmapState.totalFrames
  )
    minorStep *= 2;

  const majorStep = minorStep * 5;

  return {
    minorPx: frameToPx(minorStep, timelineUi.pixelsPerFrame),
    majorPx: frameToPx(majorStep, timelineUi.pixelsPerFrame),
  };
});

/** The grid lines array storing each line, their position in pixels, whether they are minor or major, and their frame number label. Used only by the ruler, which needs actual labeled ticks. */
const gridLines = computed(() => {
  const lines: { px: number; strong: boolean; label?: string }[] = [];

  let minorStep = 12; // base frame intervals

  // This adjustment is done to prevent DOM lag when zooming out.
  // If the space between minor ticks drops below 6 pixels, scale the steps up.
  while (
    frameToPx(minorStep, timelineUi.pixelsPerFrame) < 12 &&
    minorStep < beatmapState.totalFrames
  )
    minorStep *= 2;

  const majorStep = minorStep * 5;
  const maxAllowedWidth = frameToPx(
    beatmapState.totalFrames,
    timelineUi.pixelsPerFrame,
  );

  const majorFrames: number[] = [];
  for (let f = 0; f <= beatmapState.totalFrames; f += majorStep)
    majorFrames.push(f);

  const lastMajorFrame = majorFrames[majorFrames.length - 1];

  const startFrame = Math.max(
    0,
    Math.floor(
      visibleRange.value.left / timelineUi.pixelsPerFrame / minorStep,
    ) * minorStep,
  );
  const endFrame = Math.min(
    beatmapState.totalFrames,
    Math.ceil(
      visibleRange.value.right / timelineUi.pixelsPerFrame / minorStep,
    ) * minorStep,
  );

  for (let f = startFrame; f <= endFrame; f += minorStep) {
    const isMajor = f % majorStep === 0;
    const px = frameToPx(f, timelineUi.pixelsPerFrame);

    let label: string | undefined = undefined;

    if (isMajor && px <= maxAllowedWidth && f !== lastMajorFrame)
      label = `f${f}`;

    lines.push({
      px,
      strong: isMajor,
      label,
    });
  }

  return lines;
});

watch([() => timelineUi.pixelsPerFrame, () => beatmapState.totalFrames], () =>
  nextTick(updateVisibleRange),
);

onMounted(() => {
  updateVisibleRange();
  scrollElement.value?.addEventListener("scroll", updateVisibleRange, {
    passive: true,
  });
});

onUnmounted(() =>
  scrollElement.value?.removeEventListener("scroll", updateVisibleRange),
);
</script>

<template>
  <div
    class="z-40 overflow-hidden flex flex-col w-full"
    :style="{ height: panelHeight + 'px' }"
  >
    <div
      class="cursor-row-resize shrink-0 flex justify-center items-center h-2 border-t border-default hover:bg-primary/20 bg-default"
      @pointerdown="onPanelResizeDown"
    >
      <div class="w-10 h-1 rounded-full bg-accented" />
    </div>

    <audio
      :ref="timelineAudio.setAudioElement"
      :src="beatmapState.audioSource"
      class="hidden"
      @play="timelineAudio.onPlay"
      @pause="timelineAudio.onPause"
      @seeked="timelineAudio.onSeeked"
      @emptied="timelineAudio.onSourceChange"
      @loadedmetadata="
        () =>
          (beatmapState.songDuration =
            timelineAudio.audioElement.value?.duration ?? 0)
      "
    />

    <div
      class="flex-1 flex flex-col min-h-0 border-t border-default bg-default"
    >
      <TimelineToolbar
        :playing="isPlaying"
        :current-frame="currentFrame"
        @play="timelineAudio.audioElement.value?.play()"
        @pause="timelineAudio.audioElement.value?.pause()"
      />

      <div class="flex-1 flex min-h-0">
        <div
          class="shrink-0 flex flex-col w-36 border-r border-default bg-default"
        >
          <div
            class="border-b border-default"
            :style="{ height: RULER_HEIGHT + 'px' }"
          />

          <div
            v-for="t in NOTE_TYPES"
            :key="t.key"
            class="flex-1 flex flex-col items-center justify-center gap-1 border-b border-default px-1"
          >
            <span class="text-xs text-toned font-medium">
              {{ t.label }}
            </span>

            <div v-if="t.directions?.length" class="flex items-center gap-0.5">
              <UTooltip
                v-for="dir in ALL_DIRECTIONS.filter((d) =>
                  t.directions?.includes(d.key),
                )"
                :key="dir.key"
                :text="dir.label"
              >
                <UButton
                  :icon="dir.icon"
                  size="xs"
                  square
                  :color="
                    timelineUi.directionForType(t.key) === dir.key
                      ? 'primary'
                      : 'neutral'
                  "
                  :variant="
                    timelineUi.directionForType(t.key) === dir.key
                      ? 'solid'
                      : 'ghost'
                  "
                  @click="timelineUi.setDirectionForType(t.key, dir.key)"
                />
              </UTooltip>
            </div>
          </div>
        </div>

        <div
          ref="scrollElement"
          class="overflow-auto relative flex-1 min-w-0"
          :style="{ paddingLeft: VIEW_PADDING_LEFT + 'px' }"
        >
          <div
            class="relative"
            :style="{
              width: timelineWidth + 'px',
              height: RULER_HEIGHT + NOTE_TYPES.length * ROW_HEIGHT + 'px',
            }"
          >
            <TimelineRuler
              :timeline-width="timelineWidth"
              :grid-lines="gridLines"
              @pointerdown="timelineAudio.onRulerDown"
              @pointermove="timelineAudio.onRulerMove"
              @pointerup="timelineAudio.onRulerUp"
            />

            <div
              ref="rowsContainer"
              class="relative"
              @pointerdown="timelineInteractions.onRowsPointerDown"
              @pointermove="timelineInteractions.onRowsPointerMove"
              @pointerup="timelineInteractions.onRowsPointerUp"
            >
              <TimelineTrackRow
                v-for="t in NOTE_TYPES"
                :key="t.key"
                :type="t"
                :grid-spacing="gridSpacing"
                :timeline-width="timelineWidth"
                :visible-range="visibleRange"
                @note-down="timelineInteractions.onNoteDown"
                @hold-resize-left="timelineInteractions.onHoldResizeLeftDown"
                @hold-resize-right="timelineInteractions.onHoldResizeRightDown"
              />

              <div
                v-if="
                  timelineInteractions.marquee.value &&
                  timelineInteractions.marquee.value.moved
                "
                class="pointer-events-none z-40 absolute border border-primary rounded-lg bg-primary/10"
                :style="{
                  left:
                    Math.min(
                      timelineInteractions.marquee.value.startX,
                      timelineInteractions.marquee.value.curX,
                    ) + 'px',
                  top:
                    Math.min(
                      timelineInteractions.marquee.value.startY,
                      timelineInteractions.marquee.value.curY,
                    ) + 'px',
                  width:
                    Math.abs(
                      timelineInteractions.marquee.value.curX -
                        timelineInteractions.marquee.value.startX,
                    ) + 'px',
                  height:
                    Math.abs(
                      timelineInteractions.marquee.value.curY -
                        timelineInteractions.marquee.value.startY,
                    ) + 'px',
                }"
              />
            </div>

            <div
              class="pointer-events-none z-50 absolute w-px bg-error"
              :style="{
                left: 0,
                top: RULER_HEIGHT + 'px',
                bottom: 0,
                transform: `translate3d(${frameToPx(currentFrame, timelineUi.pixelsPerFrame)}px, 0, 0)`,
                willChange: 'transform',
              }"
            >
              <div class="-ml-1.5 -mt-1.5 rotate-45 size-3 bg-error" />
            </div>
          </div>
        </div>

        <TimelineInspector
          v-if="timelineUi.selectedNote || timelineUi.selectedNoteIds.size > 1"
        />
      </div>
    </div>
  </div>
</template>
