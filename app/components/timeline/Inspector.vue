<script setup lang="ts">
import { GRID_TILE_COUNT } from "~~/utils/constants";
import { getNoteTypeMetadata } from "~~/utils/timeline";

const timelineUi = useTimelineUiStore();
const timelineHistory = useTimelineHistoryStore();

/** The direction items to list in the inspector. */
const directionItems = computed(() => {
  const note = timelineUi.selectedNote;
  if (!note) return [];

  return ALL_DIRECTIONS.filter((d) =>
    getNoteTypeMetadata(note.type).directions?.includes(d.key),
  ).map((d) => ({
    label: d.label,
    value: d.key,
  }));
});

/** The width, in pixels, of the note inspector inside the timeline panel. */
const inspectorWidth = ref(280);

/**
 * Start resizing the note inspector.
 *
 * @param e - The pointer event properties.
 */
function onInspectorResizeDown(e: PointerEvent) {
  const startX = e.clientX;
  const origWidth = inspectorWidth.value;

  /**
   * Move the inspector based on the width.
   *
   * @param e - The pointer event properties.
   */
  function move(ev: PointerEvent) {
    inspectorWidth.value = Math.min(
      440,
      Math.max(220, origWidth + (startX - ev.clientX)),
    );
  }

  /** Stop listening to pointer events on the inspector panel. */
  function up() {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  }

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}
</script>

<template>
  <!-- inspector panel -->
  <div
    v-if="timelineUi.selectedNote || timelineUi.selectedNoteIds.size > 1"
    class="shrink-0 flex"
  >
    <div
      class="cursor-col-resize w-1.5 border-l border-default hover:bg-primary/20"
      @pointerdown="onInspectorResizeDown"
    />
    <div
      class="overflow-y-auto p-5 space-y-5"
      :style="{ width: inspectorWidth + 'px' }"
    >
      <template v-if="timelineUi.selectedNote">
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium"
            >{{
              getNoteTypeMetadata(timelineUi.selectedNote.type).label
            }}
            note</span
          >
          <!-- delete button -->
          <UTooltip text="Delete Note (Delete)">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="timelineHistory.deleteNote(timelineUi.selectedNote.id)"
            />
          </UTooltip>
        </div>

        <!-- direction -->
        <div
          v-if="
            getNoteTypeMetadata(timelineUi.selectedNote.type).directions?.length
          "
        >
          <label class="block mb-1.5 text-xs text-dimmed font-medium"
            >Direction</label
          >
          <USelect
            v-model="timelineUi.selectedNote.direction"
            :items="directionItems"
            option-attribute="label"
            value-attribute="value"
            class="w-full"
          />
        </div>

        <!-- grid index -->
        <div>
          <label class="block mb-1.5 text-xs text-dimmed font-medium"
            >Grid tile index</label
          >
          <UInputNumber
            v-model="timelineUi.selectedNote.gridIndex"
            :min="0"
            :max="GRID_TILE_COUNT"
            class="w-full"
          />
        </div>

        <!-- speed -->
        <div>
          <label class="block mb-1.5 text-xs text-dimmed font-medium"
            >Speed modifier</label
          >
          <UInputNumber
            v-model="timelineUi.selectedNote.speedModifier"
            :min="0"
            :max="4"
            class="w-full"
          />
        </div>

        <!-- start/peak frame -->
        <div>
          <label class="block mb-1.5 text-xs text-dimmed font-medium">
            {{
              timelineUi.selectedNote.type === NoteType.HOLD
                ? "Start frame"
                : "Peak frame"
            }}
          </label>
          <UInputNumber
            v-model="timelineUi.selectedNote.peakFrame"
            :min="0"
            :max="65535"
            class="w-full"
          />
        </div>

        <!-- hold frames -->
        <div v-if="timelineUi.selectedNote.type === NoteType.HOLD">
          <label class="block mb-1.5 text-xs text-dimmed font-medium"
            >Hold frames</label
          >
          <UInputNumber
            v-model="timelineUi.selectedNote.holdFrames"
            :min="1"
            :max="255"
            class="w-full"
          />
        </div>

        <!-- charge frames -->
        <div>
          <label class="block mb-1.5 text-xs text-dimmed font-medium"
            >Charge frames</label
          >
          <UInputNumber
            v-model="timelineUi.selectedNote.chargeFrames"
            :min="1"
            :max="255"
            class="w-full"
          />
        </div>
      </template>

      <template v-else>
        <!-- multiple selected notes -->
        <div class="flex justify-between items-center">
          <span class="text-sm font-medium"
            >{{ timelineUi.selectedNoteIds.size }} notes selected</span
          >
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            @click="timelineHistory.deleteSelected"
          />
        </div>
        <p class="text-xs text-dimmed">
          Drag any of the selected notes to move them together. Press Delete to
          remove them, Ctrl+C / Ctrl+X to copy or cut, and Ctrl+V to paste at
          the playhead.
        </p>
      </template>
    </div>
  </div>
</template>
