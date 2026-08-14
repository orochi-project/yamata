<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

const beatmapFile = useBeatmapFileStore();
const beatmapState = useBeatmapStateStore();

// for keyboard shortcuts
const timelineUi = useTimelineUiStore();
const timelineHistory = useTimelineHistoryStore();

const menuBarItems = computed<{ label: string; options: DropdownMenuItem[] }[]>(
  () => [
    {
      label: "File",
      options: [
        {
          label: "Open",
          kbds: ["Ctrl", "O"],
          onSelect: beatmapFile.openBeatmap,
        },

        { type: "separator" },

        {
          label: "Save",
          kbds: ["Ctrl", "S"],
          onSelect: beatmapFile.saveBeatmap,
        },
        {
          label: "Export (C)",
          kbds: ["Ctrl", "Enter"],
          onSelect: beatmapFile.exportBeatmapC,
        }, // TODO: implement this
        {
          label: "Export (JSON)",
          kbds: ["Ctrl", "Shift", "Enter"],
          onSelect: beatmapFile.exportBeatmapJson,
        },

        { type: "separator" },

        {
          label: "Import Song",
          kbds: ["Ctrl", "I"],
          onSelect: triggerAudioImport,
        },
      ],
    },
    {
      label: "Edit",
      options: [
        { label: "Undo", kbds: ["Ctrl", "Z"], onSelect: timelineHistory.undo },
        { label: "Redo", kbds: ["Ctrl", "Y"], onSelect: timelineHistory.redo },

        { type: "separator" },

        {
          label: "Cut",
          kbds: ["Ctrl", "X"],
          onSelect: timelineHistory.cutSelected,
        },
        {
          label: "Copy",
          kbds: ["Ctrl", "C"],
          onSelect: timelineHistory.copySelected,
        },
        {
          label: "Paste",
          kbds: ["Ctrl", "V"],
          onSelect: timelineHistory.pasteClipboard,
        },
        {
          label: "Delete",
          kbds: ["Del"],
          onSelect: timelineHistory.deleteSelected,
        },

        { type: "separator" },

        {
          label: "Select All",
          kbds: ["Ctrl", "A"],
          onSelect: timelineUi.selectAllNotes,
        },
      ],
    },
    {
      label: "View",
      options: [
        { label: "Zoom In Timeline", kbds: ["="], onSelect: timelineUi.zoomIn },
        {
          label: "Zoom Out Timeline",
          kbds: ["-"],
          onSelect: timelineUi.zoomOut,
        },
      ],
    },
  ],
);

/** The audio file input. */
const audioFileInput = ref<HTMLInputElement>();

/** Trigger a file import dialog. */
function triggerAudioImport() {
  audioFileInput.value?.click();
}

/**
 * Import a new audio file.
 *
 * @param e - The event properties.
 */
function onAudioFileSelected(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    if (beatmapState.audioSource?.startsWith("blob:"))
      URL.revokeObjectURL(beatmapState.audioSource); // clean up old

    beatmapState.audioSource = URL.createObjectURL(file);
    beatmapState.audioFile = file;
  }

  target.value = ""; // reset
}

defineShortcuts({
  meta_o: beatmapFile.openBeatmap,
  meta_s: beatmapFile.saveBeatmap,
  meta_enter: beatmapFile.exportBeatmapC,
  shift_meta_enter: beatmapFile.exportBeatmapJson,
  meta_i: triggerAudioImport,
});
</script>

<template>
  <UHeader>
    <input
      ref="audioFileInput"
      type="file"
      accept="audio/*"
      class="hidden"
      @change="onAudioFileSelected"
    />

    <template #left>
      <UDropdownMenu
        v-for="item in menuBarItems"
        :items="item.options"
        content-orientation="vertical"
      >
        <UButton
          size="md"
          :label="item.label"
          color="neutral"
          variant="ghost"
        />
      </UDropdownMenu>

      <UTooltip
        v-if="beatmapFile.fileDirty"
        text="Beatmap contains unsaved changes."
        class="ml-1"
      >
        <UIcon name="i-lucide-asterisk" class="size-4" />
      </UTooltip>
    </template>

    <template #right>
      <UTooltip text="Toggle Theme">
        <UColorModeButton />
      </UTooltip>

      <UTooltip text="Open on GitHub">
        <UButton
          color="neutral"
          variant="ghost"
          to="https://github.com/orochi-project"
          target="_blank"
          icon="i-simple-icons-github"
          aria-label="GitHub"
        />
      </UTooltip>
    </template>
  </UHeader>
</template>
