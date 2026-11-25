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
// how many players each sound has, so a card checks itself in O(1)
const playerCounts = new Map<string, number>();

const countPlayer = (soundId: string, change: 1 | -1) => {
  const count = (playerCounts.get(soundId) ?? 0) + change;

  if (count > 0) playerCounts.set(soundId, count);
  else playerCounts.delete(soundId);
};

const removePlayer = (userId: number) => {
  const sound = playing.get(userId);

  if (sound) countPlayer(sound.soundId, -1);

  playing.delete(userId);
  clearTimeout(timers.get(userId));
  timers.delete(userId);
};

const emit = () => listeners.forEach((listener) => listener());

const subscribe = (listener: () => void) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

/** Marks `userId` as playing a sound for `durationMs`. */
const setPlaying = (userId: number, sound: TPlaying, durationMs: number) => {
  removePlayer(userId);

  playing.set(userId, sound);
  countPlayer(sound.soundId, 1);
  timers.set(
    userId,
    setTimeout(() => {
      removePlayer(userId);
      emit();
    }, durationMs),
  );

  emit();
};

const clearPlaying = () => {
  timers.forEach(clearTimeout);
  timers.clear();
  playing.clear();
  playerCounts.clear();
  emit();
};

const usePlayingSound = (userId: number) =>
  useSyncExternalStore(subscribe, () => playing.get(userId));

/** Whether anyone in the channel is playing `soundId` right now. */
const useIsSoundPlaying = (soundId: string) =>
  useSyncExternalStore(subscribe, () => playerCounts.has(soundId));

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
