import { fileOpen, fileSave, supported } from "browser-fs-access";
import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { get, set } from "idb-keyval";

/** The key to the beatmap file handle. */
const BEATMAP_FILE_HANDLE_KEY = "yamata:beatmap-file-handle";

/** The beatmap bundle chart entry file name. */
const CHART_ENTRY_FILENAME = "chart.json";
/** The beatmap bundle audio entry file base name. */
const AUDIO_ENTRY_BASE_NAME = "audio";

export const useBeatmapFileStore = defineStore("beatmapFile", () => {
  const beatmapState = useBeatmapStateStore();

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
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        console.error("Failed to open beatmap:", err);
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
    } catch {}
  }

  /** Restore the file system file handle. */
  async function restoreHandle() {
    const handle = await get<FileSystemFileHandle>(BEATMAP_FILE_HANDLE_KEY);
    if (handle) beatmapFileHandle.value = handle;
  }

  watch(
    [() => beatmapState.notes, () => beatmapState.audioFile],
    () => {
      if (!supported) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveBeatmap, 5000);
    },
    { deep: true },
  );

  return {
    beatmapFileHandle,
    beatmapFileName,
    supported,
    openBeatmap,
    saveBeatmap,
    exportBeatmapJson,
    restoreHandle,
  };
});
