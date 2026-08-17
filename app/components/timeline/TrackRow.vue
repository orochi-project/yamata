<script setup lang="ts">
import { ROW_HEIGHT } from "~~/utils/constants";
import {
  frameToPx,
  getNoteTypeMetadata,
  getDirectionIcon,
  getDirectionLabel,
} from "~~/utils/timeline";

const props = defineProps<{
  type: { key: NoteType; label: string };
  timelineWidth: number;
  gridSpacing: { minorPx: number; majorPx: number };
}>();

const emit = defineEmits<{
  (e: "note-down", event: PointerEvent, note: Note): void;
  (e: "hold-resize-left", event: PointerEvent, note: Note): void;
  (e: "hold-resize-right", event: PointerEvent, note: Note): void;
}>();

const beatmapState = useBeatmapStateStore();
const timelineUi = useTimelineUiStore();
const timelineHistory = useTimelineHistoryStore();

/** The note head size for tap notes. */
const TAP_NOTE_HEAD_SIZE = 32;

/** The note head size for reverse notes. */
const REVERSE_NOTE_HEAD_SIZE = 48;

/** Get the head size of a note depending on its type. */
const getNoteHeadSize = (note: Note) =>
  note.type === NoteType.TAP ? TAP_NOTE_HEAD_SIZE : REVERSE_NOTE_HEAD_SIZE;

/** Notes belonging to this row's note type. */
const rowNotes = computed(() =>
  beatmapState.notes.filter((n) => n.type === props.type.key),
);

/** CSS background creating minor/major grid lines without any DOM nodes. */
const gridBackground = computed(() => {
  const { minorPx, majorPx } = props.gridSpacing;

  return [
    // major lines
    `repeating-linear-gradient(
      to right,
      var(--ui-border-muted) 0,
      var(--ui-border-muted) 1px,
      transparent 1px,
      transparent ${majorPx}px
    )`,
    // minor lines
    `repeating-linear-gradient(
      to right,
      var(--ui-border) 0,
      var(--ui-border) 1px,
      transparent 1px,
      transparent ${minorPx}px
    )`,
  ].join(", ");
});
</script>

<template>
  <div
    class="relative border-b border-default hover:bg-elevated/30"
    :style="{
      width: props.timelineWidth + 'px',
      height: ROW_HEIGHT + 'px',
      backgroundImage: gridBackground,
    }"
  >
    <template v-for="note in rowNotes" :key="note.id">
      <div
        v-if="note.type === NoteType.HOLD"
        class="z-20 pointer-events-none absolute top-1/2 -translate-y-1/2 h-9"
        :style="{
          left:
            frameToPx(
              note.peakFrame - note.chargeFrames!,
              timelineUi.pixelsPerFrame,
            ) + 'px',
          width:
            frameToPx(note.chargeFrames!, timelineUi.pixelsPerFrame) +
            getNoteHeadSize(note) +
            'px',
        }"
      >
        <div
          class="pointer-events-none absolute inset-y-0 left-0 rounded-l-sm bg-yellow-400/25"
          :style="{
            width:
              frameToPx(note.chargeFrames, timelineUi.pixelsPerFrame) + 'px',
          }"
        />

        <div
          class="pointer-events-auto overflow-hidden absolute inset-y-0 rounded-r-md flex justify-center items-center ring-2 bg-yellow-400 cursor-grab active:cursor-grabbing hover:z-30"
          :class="
            timelineUi.selectedNoteIds.has(note.id)
              ? 'ring-primary'
              : 'ring-transparent'
          "
          :style="{
            left:
              frameToPx(note.chargeFrames!, timelineUi.pixelsPerFrame) + 'px',
            width:
              frameToPx(note.holdFrames!, timelineUi.pixelsPerFrame) + 'px',
          }"
          @pointerdown="emit('note-down', $event, note)"
          @dblclick.stop="timelineHistory.deleteNote(note.id)"
        >
          <span class="relative text-xs text-yellow-900 font-bold">A</span>

          <div
            class="cursor-ew-resize absolute left-0 top-0 bottom-0 w-2.5 bg-black/15 hover:bg-black/25"
            @pointerdown.stop="emit('hold-resize-left', $event, note)"
          />

          <div
            class="cursor-ew-resize absolute right-0 top-0 bottom-0 w-2.5 bg-black/15 hover:bg-black/25"
            @pointerdown.stop="emit('hold-resize-right', $event, note)"
          />
        </div>
      </div>

      <div
        v-else
        class="z-20 pointer-events-none absolute top-1/2 -translate-y-1/2 h-9"
        :style="{
          left:
            frameToPx(
              note.peakFrame - note.chargeFrames!,
              timelineUi.pixelsPerFrame,
            ) + 'px',
          width:
            frameToPx(note.chargeFrames!, timelineUi.pixelsPerFrame) +
            getNoteHeadSize(note) +
            'px',
        }"
      >
        <div
          class="pointer-events-none absolute inset-y-2 left-0 right-4 rounded-l-sm"
          :class="[
            note.type === NoteType.TAP
              ? 'bg-green-300/25'
              : 'bg-fuchsia-400/25',
          ]"
        />

        <div
          v-if="note.type === NoteType.TAP"
          class="pointer-events-auto cursor-grab active:cursor-grabbing hover:z-30 absolute flex justify-center items-center right-0 top-1/2 -translate-y-1/2 size-8 rounded-full ring-2 bg-green-300"
          :class="
            timelineUi.selectedNoteIds.has(note.id)
              ? 'ring-primary'
              : 'ring-transparent'
          "
          @pointerdown="emit('note-down', $event, note)"
          @dblclick.stop="timelineHistory.deleteNote(note.id)"
        >
          <UIcon
            v-if="note.direction !== undefined"
            :name="getDirectionIcon(note.direction)!"
            class="size-4 text-green-950"
          />
        </div>

        <div
          v-else
          class="pointer-events-auto cursor-grab active:cursor-grabbing hover:z-30 absolute flex justify-center items-center right-0 top-1/2 -translate-y-1/2"
          :style="{
            width: REVERSE_NOTE_HEAD_SIZE + 'px',
            height: REVERSE_NOTE_HEAD_SIZE + 'px',
          }"
          @pointerdown="emit('note-down', $event, note)"
          @dblclick.stop="timelineHistory.deleteNote(note.id)"
        >
          <div
            class="absolute rotate-45 rounded-md ring-2 bg-fuchsia-400"
            :class="
              timelineUi.selectedNoteIds.has(note.id)
                ? 'ring-primary'
                : 'ring-transparent'
            "
            :style="{
              width: REVERSE_NOTE_HEAD_SIZE / Math.SQRT2 + 'px',
              height: REVERSE_NOTE_HEAD_SIZE / Math.SQRT2 + 'px',
            }"
          />

          <span class="relative text-xs font-bold text-fuchsia-900">B</span>
        </div>
      </div>
    </template>
  </div>
</template>
