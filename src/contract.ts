/** shared so the form and the server agree on what fits */
const MAX_NAME_LENGTH = 32;

type TCategory = {
  id: string;
  name: string;
};

type TSound = {
  id: string;
  name: string;
  /** absent for a sound in no category, which the soundboard lists last */
  categoryId?: string;
  uploaderId: number;
  durationMs: number;
  createdAt: number;
};

/** What an edit to a sound changes. `categoryId: null` takes it out of one. */
type TSoundChanges = {
  name?: string;
  categoryId?: string | null;
};

type TSoundboard = {
  sounds: TSound[];
  categories: TCategory[];
  maxDurationMs: number;
  /** of the encoded file, so only known once a clip is trimmed and encoded */
  maxBytes: number;
  /** bring uploads to a common loudness before they are encoded */
  normalizeLoudness: boolean;
};

type TSharkord = {
  actions: {
    getSoundboard: {
      payload: void;
      response: TSoundboard;
    };
    playSound: {
      payload: { soundId: string };
      /** until the caller can play again */
      response: { cooldownMs: number };
    };
    deleteSound: {
      payload: { soundId: string };
      response: void;
    };
    deleteAnySound: {
      payload: { soundId: string };
      response: void;
    };
    updateSound: {
      payload: { soundId: string; changes: TSoundChanges };
      response: void;
    };
    updateAnySound: {
      payload: { soundId: string; changes: TSoundChanges };
      response: void;
    };
    createCategory: {
      payload: { name: string };
      response: TCategory;
    };
    renameCategory: {
      payload: { categoryId: string; name: string };
      response: void;
    };
    deleteCategory: {
      payload: { categoryId: string };
      response: void;
    };
  };
  push:
    | {
        type: "play";
        soundId: string;
        userId: number;
        soundName: string;
        durationMs: number;
        /** mark the player's card and sidebar row while the sound plays */
        showBadge: boolean;
      }
    // the list can outgrow a push, so clients fetch it again instead
    | { type: "changed" };
  userData: {
    favorites?: string[];
    /** 0 to 1, kept while muted so unmuting restores it */
    volume?: number;
    muted?: boolean;
  };
};

export { MAX_NAME_LENGTH };
export type { TCategory, TSharkord, TSound, TSoundChanges, TSoundboard };
