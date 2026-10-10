/** shared so the form and the server agree on what fits */
const MAX_NAME_LENGTH = 32;

type TSound = {
  id: string;
  name: string;
  uploaderId: number;
  durationMs: number;
  createdAt: number;
};

type TSoundboard = {
  sounds: TSound[];
  maxDurationMs: number;
  /** of the encoded file, so only known once a clip is trimmed and encoded */
  maxBytes: number;
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
export type { TSharkord, TSound, TSoundboard };
