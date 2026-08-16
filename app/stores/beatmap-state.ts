import { FRAMES_PER_SECOND, MAX_NOTE_COUNT } from "~~/utils/constants";
import { findOamBudgetViolations } from "~~/utils/oam-budget";

export const useBeatmapStateStore = defineStore("beatmapState", () => {
  /** The audio source to play. */
  const audioSource = ref<string>();

  /** The currently loaded audio file. */
  const audioFile = ref<File>();

  /** The song duration. */
  const songDuration = ref<number>(0);

  /** The total number of frames in the current sequence. */
  const totalFrames = computed<number>(() =>
    Math.ceil(FRAMES_PER_SECOND * songDuration.value),
  );

  /** The reactive array storing every note currently placed in the timeline. */
  const notes = ref<Note[]>([]);

  /** Whether or not the beatmap exceeds the note limit. */
  const exceedsNoteLimit = computed<boolean>(
    () => notes.value.length > MAX_NOTE_COUNT,
  );

  /** The points in time the beatmap exceeds the Game Boy's OAM or sprite budget. */
  const oamBudgetViolations = computed(() =>
    findOamBudgetViolations(notes.value),
  );

  /** Whether or not the beatmap exceeds the OAM or sprite budget anywhere. */
  const exceedsOamBudget = computed<boolean>(
    () => oamBudgetViolations.value.length > 0,
  );

  return {
    audioSource,
    audioFile,
    songDuration,
    totalFrames,
    notes,
    exceedsNoteLimit,
    oamBudgetViolations,
    exceedsOamBudget,
  };
});
