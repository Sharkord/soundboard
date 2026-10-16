import { memo, useEffect, useRef, useSyncExternalStore } from "react";
import { callAction } from "./store";

type TCooldown = {
  /** the sound the user played, the one card that shows the cooldown */
  soundId: string | undefined;
  startedAt: number;
  until: number;
  isActive: boolean;
};

// one for the whole app, not per component: a hotkey, the popover and the
// detached window all play through it, so they share one cooldown, and
// closing and reopening the popover does not re-enable the buttons early
let cooldown: TCooldown = {
  soundId: undefined,
  startedAt: 0,
  until: 0,
  isActive: false,
};
const listeners = new Set<() => void>();

const setCooldown = (next: TCooldown) => {
  cooldown = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/** The user's cooldown, as the server counts it. */
const useCooldown = () => useSyncExternalStore(subscribe, () => cooldown);

/**
 * Plays a sound for the voice channel, unless the user is still cooling down.
 * Throws why the server refused it.
 */
const requestPlay = async (soundId: string) => {
  if (cooldown.isActive) return;

  const { cooldownMs } = await callAction("playSound", { soundId });

  if (cooldownMs <= 0) return;

  const started: TCooldown = {
    soundId,
    startedAt: Date.now(),
    until: Date.now() + cooldownMs,
    isActive: true,
  };

  setCooldown(started);
  setTimeout(() => {
    // a later play has its own timer
    if (cooldown === started) setCooldown({ ...started, isActive: false });
  }, cooldownMs);
};

/** Shrinks away over what is left of the cooldown, from where it is now. */
const CooldownBar = memo(() => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const remaining = cooldown.until - Date.now();

    if (!ref.current || remaining <= 0) return;

    const animation = ref.current.animate(
      [
        {
          transform: `scaleX(${remaining / (cooldown.until - cooldown.startedAt)})`,
        },
        { transform: "scaleX(0)" },
      ],
      { duration: remaining, fill: "forwards" },
    );

    return () => animation.cancel();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: 6,
        right: 6,
        bottom: 4,
        height: 3,
        borderRadius: 2,
        background: "var(--primary)",
        transformOrigin: "left",
        pointerEvents: "none",
      }}
    />
  );
});

export { CooldownBar, requestPlay, useCooldown };
