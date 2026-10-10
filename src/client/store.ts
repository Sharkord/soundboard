import {
  createCallAction,
  usePlaybackDeviceId,
  usePush,
  useStoreSelector,
  useUserData,
  type TPluginStoreState,
} from "@sharkord/plugin-sdk/client";
import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../helpers";
import type { TSharkord, TSoundboard } from "../contract";

const PLUGIN_ID = "soundboard";
const DEFAULT_VOLUME = 0.5;

const callAction = createCallAction<TSharkord>();

const formatDuration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** Runs a call and keeps its failure as text for the UI to show. */
const useErrorState = () => {
  const [error, setError] = useState("");

  const run = useCallback(async (call: () => Promise<unknown>) => {
    try {
      await call();
      setError("");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  return { error, setError, run };
};

/** Every sound on the server, refetched whenever one is added or deleted. */
const useSoundboard = () => {
  const [soundboard, setSoundboard] = useState<TSoundboard>({
    sounds: [],
    maxDurationMs: 0,
    maxBytes: 0,
  });

  const refresh = useCallback(() => {
    callAction("getSoundboard")
      .then(setSoundboard)
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  usePush<TSharkord>((data) => {
    if (data.type === "changed") refresh();
  });

  return soundboard;
};

// the SDK wraps the capability check for actions and commands, not for
// routes, so this goes to the store's hook directly. Named the way the server
// keys routes: method and path.
const useCanUpload = () =>
  window.__SHARKORD_STORE__.hooks.useCanUse(
    "http_route" as Parameters<
      typeof window.__SHARKORD_STORE__.hooks.useCanUse
    >[0],
    "POST /sounds",
  );

const useUserName = (userId: number): string | undefined => {
  const users = useStoreSelector((state: TPluginStoreState) => state.users);

  return users.find((user) => user.id === userId)?.name;
};

type TUserData = NonNullable<TSharkord["userData"]>;

/**
 * One `useUserData` result, handed down to children: every call of the hook
 * keeps its own copy, so a second one would miss what the first one saves.
 */
type TUserDataState = ReturnType<typeof useUserData<TSharkord>>;

/**
 * How this user hears sounds: their volume, on their output device. Pass the
 * user data when a parent holds it, so a volume change reaches this too.
 */
const usePlaybackOptions = (userData?: TUserData) => {
  const { data } = useUserData<TSharkord>();
  const deviceId = usePlaybackDeviceId();
  const { muted, volume = DEFAULT_VOLUME } = userData ?? data;

  return { volume: muted ? 0 : volume, deviceId };
};

export type { TUserData, TUserDataState };
export {
  DEFAULT_VOLUME,
  PLUGIN_ID,
  callAction,
  formatDuration,
  useCanUpload,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
  useUserName,
};
