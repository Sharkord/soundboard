import { AudioLines } from "lucide-react";
import { memo, useSyncExternalStore } from "react";

type TPlaying = {
  soundId: string;
  soundName: string;
  /** whether the server wants the player marked on their card and row */
  showBadge: boolean;
};

// who is playing what in the user's voice channel. Fed once by VoiceControls,
// which hears every play, and read by every card, sidebar row and sound card:
// one push listener for the channel instead of one per reader
const playing = new Map<number, TPlaying>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/** Marks `userId` as playing a sound for `durationMs`. */
const setPlaying = (userId: number, sound: TPlaying, durationMs: number) => {
  clearTimeout(timers.get(userId));

  playing.set(userId, sound);
  timers.set(
    userId,
    setTimeout(() => {
      playing.delete(userId);
      timers.delete(userId);
      emit();
    }, durationMs),
  );

  emit();
};

const clearPlaying = () => {
  timers.forEach(clearTimeout);
  timers.clear();
  playing.clear();
  emit();
};

const usePlayingSound = (userId: number) =>
  useSyncExternalStore(subscribe, () => playing.get(userId));

/** Whether anyone in the channel is playing `soundId` right now. */
const useIsSoundPlaying = (soundId: string) =>
  useSyncExternalStore(subscribe, () =>
    [...playing.values()].some((sound) => sound.soundId === soundId),
  );

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  maxWidth: "100%",
  borderRadius: 999,
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  pointerEvents: "none",
} as const;

type TPlayerBadgeProps = {
  userId: number;
  /** icon only, for the narrow sidebar row */
  compact?: boolean;
};

const PlayerBadge = memo(({ userId, compact }: TPlayerBadgeProps) => {
  const sound = usePlayingSound(userId);

  if (!sound?.showBadge) return null;

  const { soundName } = sound;

  return (
    <span
      title={`Playing ${soundName}`}
      style={{
        ...badgeStyle,
        padding: compact ? 2 : "2px 8px",
        fontSize: 11,
      }}
    >
      <AudioLines size={12} style={{ flexShrink: 0 }} />
      {!compact && (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {soundName}
        </span>
      )}
    </span>
  );
});

type TSlotProps = { channelId: number; userId: number };

const VoiceUserCardBadge = memo(({ userId }: TSlotProps) => (
  <PlayerBadge userId={userId} />
));

const VoiceUserRowBadge = memo(({ userId }: TSlotProps) => (
  <PlayerBadge userId={userId} compact />
));

export {
  VoiceUserCardBadge,
  VoiceUserRowBadge,
  clearPlaying,
  setPlaying,
  useIsSoundPlaying,
};
