import { fileOpen, fileSave, supported } from "browser-fs-access";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { get, set } from "idb-keyval";
import {
  type ScanlineCheckpoint,
  computeScanlineCheckpoints,
} from "../../utils/scanline";
import { MAX_NOTE_COUNT } from "~~/utils/constants";

import Modal from "~/components/Modal.vue";

/** The key to the beatmap file handle. */
const BEATMAP_FILE_HANDLE_KEY = "yamata:beatmap-file-handle";

/** The beatmap bundle chart entry file name. */
const CHART_ENTRY_FILENAME = "chart.json";
/** The beatmap bundle audio entry file base name. */
const AUDIO_ENTRY_BASE_NAME = "audio";

export const useBeatmapFileStore = defineStore("beatmapFile", () => {
  const beatmapState = useBeatmapStateStore();

  const overlay = useOverlay();

  /** The handle to the selected file. */
  const beatmapFileHandle = ref<FileSystemFileHandle>();

  /**
   * The name of the currently open beatmap file.
   *
   * Tracked independently because Firefox does not give a real handle.
   */
  const beatmapFileName = ref<string>();

  /** The timer/interval to save the file. */
  let saveTimer: ReturnType<typeof setTimeout>;

  /** Whether or not the file contains unsaved changes. */
  const fileDirty = ref<boolean>(false);

  /** Whether or not the file is currently loading. */
  const loadingFile = ref<boolean>(false);

  /**
   * Serialize the current beatmap into a blob.
   *
   * @returns The serialized blob as a ZIP bundle.
   */
  async function serializeBeatmap(): Promise<Blob> {
    const sorted = [...beatmapState.notes].sort(
      (a, b) => a.peakFrame - a.chargeFrames - (b.peakFrame - b.chargeFrames),
    );

    const files: Record<string, Uint8Array> = {
      [CHART_ENTRY_FILENAME]: strToU8(JSON.stringify(sorted)),
    };

    if (beatmapState.audioFile) {
      const audioBytes = new Uint8Array(
        await beatmapState.audioFile.arrayBuffer(),
      );

      const ext = getFileExtension(beatmapState.audioFile.name);
      const audioName = ext
        ? `${AUDIO_ENTRY_BASE_NAME}.${ext}`
        : AUDIO_ENTRY_BASE_NAME;
      files[audioName] = audioBytes;
    }

    return new Blob([zipSync(files, { level: 6 })], {
      type: "application/zip",
    });
  }

  /**
   * Get the base name of a filename.
   *
   * @param filename - The full filename.
   *
   * @returns The file base name.
   */
  function getBaseName(filename?: string): string {
    if (!filename) return "";
    const dot = filename.lastIndexOf(".");
    return dot <= 0 ? filename : filename.slice(0, dot);
  }

  /**
   * Get the file extension of a given filename.
   *
   * Returns "audio" if no file extension is found.
   *
   * @param filename - The full filename.
   *
   * @returns The file extension.
   */
  function getFileExtension(filename?: string): string {
    if (!filename) return "";
    const dot = filename.lastIndexOf(".");
    return dot <= 0 ? "" : filename.slice(dot + 1);
  }

  /** Open an existing beatmap bundle and split it into notes and audio. */
  async function openBeatmap() {
    try {
      loadingFile.value = true;

      const blob = await fileOpen({
        extensions: [".orbm"],
        description: "Orochi Beatmap Bundle",
      });

      beatmapFileName.value = blob.name;

      const bytes = new Uint8Array(await blob.arrayBuffer());
      const entries = unzipSync(bytes);

      const chartEntry = entries[CHART_ENTRY_FILENAME];
      if (!chartEntry)
        throw new Error(`Bundle is missing ${CHART_ENTRY_FILENAME}.`);
      beatmapState.notes = JSON.parse(strFromU8(chartEntry));

      const audioEntryName = Object.keys(entries).find((name) =>
        name.startsWith(`${AUDIO_ENTRY_BASE_NAME}.`),
      ); // first one that starts with the audio entry
      if (audioEntryName) {
        const audioBytes = entries[audioEntryName];
        if (!audioBytes)
          throw new Error(
            `The audio entry ${audioEntryName} does not contain any valid data.`,
          );

        const audioFile = new File([audioBytes], audioEntryName, {
          type: guessAudioMime(audioEntryName),
        });

        if (beatmapState.audioSource?.startsWith("blob:"))
          URL.revokeObjectURL(beatmapState.audioSource);

        // replace old audio source
        beatmapState.audioFile = audioFile;
        beatmapState.audioSource = URL.createObjectURL(audioFile);
      }

      beatmapFileHandle.value = blob.handle;
      if (beatmapFileHandle.value) {
        const granted =
          (await beatmapFileHandle.value.queryPermission({
            mode: "readwrite",
          })) === "granted" ||
          (await beatmapFileHandle.value.requestPermission({
            mode: "readwrite",
          })) === "granted";

        if (granted)
          await set(BEATMAP_FILE_HANDLE_KEY, beatmapFileHandle.value);
        else beatmapFileHandle.value = undefined;
      }

      if (beatmapState.exceedsNoteLimit) {
        const modal = overlay.create(Modal);

        await modal.open({
          title: "Note Limit Exceeded",
          message: `This beatmap exceeds the ${MAX_NOTE_COUNT}-note limit. If you try to use this beatmap in Orochi, the program might fail to compile due to ROM bank size limits. Consider reducing the note count.`,
          buttons: [{ label: "Got It!", color: "primary" }],
        });
      }

      if (beatmapState.exceedsOamBudget) {
        const modal = overlay.create(Modal);
        const first = beatmapState.oamBudgetViolations[0]!;
        const where =
          first.scope === "total"
            ? `${first.activeCount} notes are active at the same time around frame ${first.frame} (OAM limit: ${first.limit})`
            : `${first.activeCount} notes are active at the same time in row ${
                first.row! + 1
              } around frame ${first.frame} (OAM limit: ${first.limit})`;

        await modal.open({
          title: "Sprite Budget Exceeded",
          message: `${where}. Notes may flicker or disappear entirely on the actual export. You should space out or remove overlapping notes.`,
          buttons: [{ label: "Got It!", color: "primary" }],
        });
      }

      fileDirty.value = false;
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        console.error("Failed to open beatmap:", err);
    } finally {
      loadingFile.value = false;
    }
  }

  /** Guess the MIME type of an audio from its file extension. */
  function guessAudioMime(name: string): string {
    if (name.endsWith(".mp3")) return "audio/mpeg";
    if (name.endsWith(".wav")) return "audio/wav";
    if (name.endsWith(".ogg")) return "audio/ogg";
    if (name.endsWith(".flac")) return "audio/flac";
    return "application/octet-stream";
  }

  /** Save to the beatmap if we have one; otherwise prompt once. */
  async function saveBeatmap() {
    try {
      const handle = await fileSave(
        await serializeBeatmap(),
        {
          fileName: `${getBaseName(beatmapFileName.value) || CHART_ENTRY_FILENAME}.orbm`,
          extensions: [".orbm"],
        },
        beatmapFileHandle.value,
        false,
      );

      if (handle) {
        beatmapFileHandle.value = handle;
        beatmapFileName.value = handle.name;
        await set(BEATMAP_FILE_HANDLE_KEY, handle);
      }

      fileDirty.value = false;
    } catch (err) {
      console.error("Failed to save beatmap:", err);
    }
  }

  /** Export the beatmap as a JSON file. */
  async function exportBeatmapJson() {
    try {
      const converted = [...beatmapState.notes]
        .sort(
          (a, b) =>
            a.peakFrame - a.chargeFrames - (b.peakFrame - b.chargeFrames),
        )
        .map((note) => {
          let noteType: number;

          if (note.type == NoteType.TAP)
            switch (note.direction) {
              case Direction.LEFT:
                noteType = 0;
                break;
              case Direction.RIGHT:
                noteType = 1;
                break;
              case Direction.UP:
                noteType = 2;
                break;
              case Direction.DOWN:
                noteType = 3;
                break;
            }
          else if (note.type == NoteType.HOLD) noteType = 4;
          else noteType = 5;

          return {
            type: noteType!,
            grid_idx: note.gridIndex,
            speed_modifier: note.speedModifier,
            appear_frame: note.peakFrame - note.chargeFrames,
            charge_frames: note.chargeFrames,
            hold_frames: note.holdFrames || 0,
          };
        });

      const json = JSON.stringify(converted, null, 2);

      const blob = new Blob([json], {
        type: "application/json",
      });

      await fileSave(blob, {
        fileName: getBaseName(beatmapFileName.value) || CHART_ENTRY_FILENAME,
        extensions: [".json"],
        description: "Orochi Beatmap JSON",
      });
    } catch (err) {
      console.error("Failed to export beatmap to JSON:", err);
    }
  }

  /**
   * Convert a string into a Pascal-case identifier fragment.
   *
   * @param input - The input string.
   *
   * @returns The string in Pascal-case.
   */
  function toPascalCase(input: string): string {
    const words = input
      .replace(/[^a-zA-Z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return "Untitled";

    return words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Convert a Pascal-case string into snake_case.
   *
   * @param input - The input string in Pascal-case.
   *
   * @returns The string in snake_case.
   */
  function pascalToSnakeCase(input: string): string {
    return input.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  }

  /**
   * Get the Orochi C enum name for a note's type/direction.
   *
   * @param note - The note to extract.
   *
   * @returns The note type's enum name.
   */
  function noteTypeMacro(note: Note): string {
    if (note.type === NoteType.HOLD) return "Hold";
    if (note.type === NoteType.REVERSE) return "Reverse";
    switch (
      note.direction // only tap notes
    ) {
      case Direction.LEFT:
        return "TapLeft";
      case Direction.RIGHT:
        return "TapRight";
      case Direction.UP:
        return "TapUp";
      case Direction.DOWN:
        return "TapDown";
      default:
        return "TapLeft";
    }
  }

  /**
   * Format a note as a Note struct initializer.
   *
   * @param note - The note to format.
   * @param scanline - The scanline's checkpoint state at the note's peak frame.
   *
   * @returns The formatted Note struct string.
   */
  function formatNoteEntry(note: Note, scanline: ScanlineCheckpoint): string {
    return (
      `    {\n` +
      `        .type = ${noteTypeMacro(note)},\n` +
      `        .grid_idx = ${note.gridIndex},\n` +
      `        .speed_modifier = ${note.speedModifier},\n` +
      `        .appear_frame = ${note.peakFrame - note.chargeFrames},\n` +
      `        .charge_frames = ${note.chargeFrames},\n` +
      `        .hold_frames = ${note.holdFrames || 0},\n` +
      `        .scanline_x = ${scanline.x},\n` +
      `        .scanline_direction = ${scanline.direction},\n` +
      `    },`
    );
  }

  /** Export the beatmap as an Orochi C source/header pair, bundled as a ZIP. */
  async function exportBeatmapC() {
    try {
      if (beatmapState.exceedsNoteLimit) {
        const modal = overlay.create(Modal);

        const result = await modal.open({
          title: "Note Limit Exceeded",
          message: `This beatmap exceeds the ${MAX_NOTE_COUNT}-note limit. You can still export the map, but the Orochi might fail to compile due to ROM bank size limits. Would you like to export anyway?`,
          buttons: [
            {
              label: "No",
              color: "neutral",
              variant: "soft",
              onClick: () => false,
            },
            {
              label: "Yes",
              color: "primary",
              onClick: () => true,
            },
          ],
        });

        if (!result) return;
      }

      if (beatmapState.exceedsOamBudget) {
        const modal = overlay.create(Modal);
        const first = beatmapState.oamBudgetViolations[0]!;
        const where =
          first.scope === "total"
            ? `${first.activeCount} notes are active at the same time around frame ${first.frame} (OAM limit: ${first.limit})`
            : `${first.activeCount} notes are active at the same time in row ${
                first.row! + 1
              } around frame ${first.frame} (OAM limit: ${first.limit})`;

        const result = await modal.open({
          title: "Sprite Budget Exceeded",
          message: `${where}. If you don't go back and resolve them, the notes may flicker or disappear entirely on the actual export. Would you like to export anyway?`,
          buttons: [
            {
              label: "No",
              color: "neutral",
              variant: "soft",
              onClick: () => false,
            },
            { label: "Yes", color: "primary", onClick: () => true },
          ],
        });

        if (!result) return;
      }

      const pascalName = toPascalCase(getBaseName(beatmapFileName.value));
      const snakeName = pascalToSnakeCase(pascalName);

      const sorted = [...beatmapState.notes].sort(
        (a, b) => a.peakFrame - a.chargeFrames - (b.peakFrame - b.chargeFrames),
      );

      const scanlineCheckpoints = computeScanlineCheckpoints(sorted);

      const entries = sorted
        .map((note) => {
          const scanline = scanlineCheckpoints.get(note.id);
          if (!scanline)
            console.error(
              `No scanline checkpoint computed for note ${note.id}. Defaulting to { .scanline_x = 0, .scanline_direction = 1 }.`,
            );
          return formatNoteEntry(note, scanline ?? { x: 0, direction: 1 });
        })
        .join("\n");

      const headerFile = `#pragma once

#include "Notes.h"
#include "gbdk/platform.h"

/** The total frame count of the beatmap. */
#define MAP_${snakeName.toUpperCase()}_FRAME_COUNT ${beatmapState.totalFrames}
/** The number of notes in the beatmap. */
#define MAP_${snakeName.toUpperCase()}_NOTE_COUNT ${sorted.length}

BANKREF_EXTERN(map_${snakeName})

/** The array of notes in the beatmap. */
extern const Note map_${snakeName}_notes[MAP_${snakeName.toUpperCase()}_NOTE_COUNT];
`;

      const sourceFile = `#include "Banks/SetAutoBank.h"

#include "Map${pascalName}.h"

BANKREF(map_${snakeName})

const Note map_${snakeName}_notes[MAP_${snakeName.toUpperCase()}_NOTE_COUNT] = {
${entries}
};
`;

      const files: Record<string, Uint8Array> = {
        [`Map${pascalName}.c`]: strToU8(sourceFile),
        [`Map${pascalName}.h`]: strToU8(headerFile),
      };

      const blob = new Blob([zipSync(files, { level: 6 })], {
        type: "application/zip",
      });

      await fileSave(blob, {
        fileName: `Map${pascalName}`,
        extensions: [".zip"],
        description: "Orochi Beatmap C Source/Header",
      });
    } catch (err) {
      console.error("Failed to export beatmap to C:", err);
    }
  }

  /** Restore the file system file handle. */
  async function restoreHandle() {
    const handle = await get<FileSystemFileHandle>(BEATMAP_FILE_HANDLE_KEY);
    if (handle) beatmapFileHandle.value = handle;
  }

  /**
   * Show the built-in "unsaved changes" dialog provided by the browser.
   *
   * @param event - The before-unload event.
   */
  function beforeUnloadHandler(event: BeforeUnloadEvent) {
    if (!fileDirty.value) return;
    event.preventDefault();
  }

  if (import.meta.client) {
    watch(
      fileDirty,
      (dirty) => {
        if (dirty) {
          window.addEventListener("beforeunload", beforeUnloadHandler);
        } else {
          window.removeEventListener("beforeunload", beforeUnloadHandler);
        }
      },
      { immediate: true },
    );
  }

  watch(
    () => beatmapState.notes,
    () => {
      if (loadingFile.value) return;

      fileDirty.value = true;

      if (!supported) return;

      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveBeatmap, 5000);
    },
    {
      deep: true,
      flush: "sync",
    },
  );

  watch(
    () => beatmapState.audioFile,
    () => {
      if (loadingFile.value) return;

      fileDirty.value = true;

      if (!supported) return;

      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveBeatmap, 5000);
    },
    {
      flush: "sync",
    },
  );

  return {
    beatmapFileHandle,
    beatmapFileName,
    fileDirty,
    supported,
    openBeatmap,
    saveBeatmap,
    exportBeatmapJson,
    exportBeatmapC,
    restoreHandle,
  };
});
