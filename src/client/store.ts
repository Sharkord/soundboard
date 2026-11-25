import {
  createCallAction,
  usePlaybackDeviceId,
  usePush,
  useUserData,
} from "@sharkord/plugin-sdk/client";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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

/**
 * `next`, with every item equal to one in `previous` swapped for that one,
 * and `previous` itself when nothing changed. A refetch then hands memoized
 * components the same objects, so only what changed renders again.
 */
const reuseUnchanged = <T extends { id: string }>(previous: T[], next: T[]) => {
  const byId = new Map(previous.map((item) => [item.id, item]));
  let changed = previous.length !== next.length;

  const merged = next.map((item, index) => {
    const old = byId.get(item.id);

    // flat records, so comparing their JSON is comparing them
    if (old && JSON.stringify(old) === JSON.stringify(item)) {
      if (previous[index] !== old) changed = true;

      return old;
    }

    changed = true;

    return item;
  });

  return changed ? merged : previous;
};

// one copy of the soundboard for the whole plugin: the picker, its detached
// window, the settings and admin tabs all read it, and it is fetched once,
// not once per component that shows it
let soundboard: TSoundboard = {
  sounds: [],
  categories: [],
  maxDurationMs: 0,
  maxBytes: 0,
  normalizeLoudness: true,
};
const soundboardListeners = new Set<() => void>();
// nobody hears `changed` while nothing is mounted, so the copy may be old
let isStale = true;
let isRefreshScheduled = false;
let isRefreshing = false;
let refreshAgain = false;

const refreshSoundboard = async () => {
  if (isRefreshing) {
    // a change landed mid-request: its answer may predate it
    refreshAgain = true;

    return;
  }

  isRefreshing = true;

  try {
    const next = await callAction("getSoundboard");

    const merged: TSoundboard = {
      ...next,
      sounds: reuseUnchanged(soundboard.sounds, next.sounds),
      categories: reuseUnchanged(soundboard.categories, next.categories),
    };
    const isUnchanged = (Object.keys(merged) as (keyof TSoundboard)[]).every(
      (key) => merged[key] === soundboard[key],
    );

    isStale = false;

    if (!isUnchanged) {
      soundboard = merged;
      soundboardListeners.forEach((listener) => listener());
    }
  } catch {
    // kept as it is; the next change or mount tries again
  } finally {
    isRefreshing = false;
  }

  if (refreshAgain) {
    refreshAgain = false;
    void refreshSoundboard();
  }
};

// every mounted reader hears the same push; they share one request for it
const scheduleRefresh = () => {
  if (isRefreshScheduled) return;

  isRefreshScheduled = true;
  queueMicrotask(() => {
    isRefreshScheduled = false;
    void refreshSoundboard();
  });
};

const subscribeSoundboard = (listener: () => void) => {
  soundboardListeners.add(listener);

  if (isStale) scheduleRefresh();

  return () => {
    soundboardListeners.delete(listener);

    if (soundboardListeners.size === 0) isStale = true;
  };
};

/** Every sound on the server, kept current while anything shows it. */
const useSoundboard = () => {
  usePush<TSharkord>((data) => {
    if (data.type === "changed") scheduleRefresh();
  });

  return useSyncExternalStore(subscribeSoundboard, () => soundboard);
};

/**
 * A function that never changes but always runs the latest `callback`: for
 * handlers passed to memoized children, which then skip renders.
 */
const useStableCallback = <TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
) => {
  const ref = useRef(callback);

  useLayoutEffect(() => {
    ref.current = callback;
  });

  return useCallback((...args: TArgs) => ref.current(...args), []);
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

/** How this user hears sounds: their volume, on their output device. */
const usePlaybackOptions = () => {
  const { data } = useUserData<TSharkord>();
  const deviceId = usePlaybackDeviceId();
  const { muted, volume = DEFAULT_VOLUME } = data;

  return { volume: muted ? 0 : volume, deviceId };
};

export {
  DEFAULT_VOLUME,
  PLUGIN_ID,
  callAction,
  formatDuration,
  useCanUpload,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
  useStableCallback,
};
