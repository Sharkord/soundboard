import {
  usePush,
  useStoreSelector,
  useUserData,
} from "@sharkord/plugin-sdk/client";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sharkord/ui";
import {
  AudioLines,
  ChevronDown,
  ChevronRight,
  Heart,
  PictureInPicture2,
  Plus,
} from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { TSharkord, TSound } from "../contract";
import { groupSounds } from "../groups";
import {
  formatDuration,
  useCanUpload,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
  useStableCallback,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";
import { playSound } from "./audio";
import { CooldownBar, requestPlay, useCooldown } from "./cooldown";
import {
  DetachedWindow,
  openDetachedWindow,
  useDetachedWindowLifecycle,
} from "./detached-window";
import { clearPlaying, setPlaying, useIsSoundPlaying } from "./player-badge";
import { SoundHotkeyButton, SoundHotkeyLabel, SoundHotkeys } from "./hotkeys";
import { UploadForm } from "./upload-form";
import { VolumeControl } from "./volume-control";

const FAVORITE_COLOR = "#ef4444";

// sized for cards around 120px square: big enough to read and hit quickly
const GRID_COLUMNS = 4;
const GRID_GAP = 8;
const POPOVER_WIDTH = 520;
const POPOVER_GRID_MAX_HEIGHT = 440;
const DETACHED_WINDOW_SIZE = { width: 560, height: 720 };
const UPLOAD_DIALOG_MAX_WIDTH = "min(720px, calc(100% - 2rem))";
// two rows of the grid
const MAX_RECENT = GRID_COLUMNS * 2;
// plays in a burst save the recent list once, not once per play
const RECENT_SAVE_DELAY_MS = 2000;
const NO_IDS: string[] = [];

type TSoundCardProps = {
  sound: TSound;
  isFavorite: boolean;
  disabled: boolean;
  /** the card of the sound the user played, which shows the cooldown */
  showCooldown: boolean;
  /** false in the detached window, where a popover would open in the main one */
  canEditHotkey: boolean;
  onPlay: (soundId: string) => void;
  /** plays it for this user only, to hear it before the channel does */
  onPreview: (soundId: string) => void;
  onToggleFavorite: (soundId: string) => void;
};

const SoundCard = memo(
  ({
    sound,
    isFavorite,
    disabled,
    showCooldown,
    canEditHotkey,
    onPlay,
    onPreview,
    onToggleFavorite,
  }: TSoundCardProps) => {
    const isPlaying = useIsSoundPlaying(sound.id);

    return (
      <div style={{ position: "relative", aspectRatio: "1 / 1" }}>
        <Button
          // lit up while it plays in the channel, whoever played it
          variant={isPlaying ? "default" : "secondary"}
          title={`${sound.name} · ${formatDuration(sound.durationMs)}\nShift-click or right-click to preview`}
          disabled={disabled}
          style={{
            width: "100%",
            height: "100%",
            padding: 6,
            whiteSpace: "normal",
            fontSize: 13,
            lineHeight: 1.2,
          }}
          onClick={(event) =>
            event.shiftKey ? onPreview(sound.id) : onPlay(sound.id)
          }
          onContextMenu={(event) => {
            event.preventDefault();
            onPreview(sound.id);
          }}
        >
          <span
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              wordBreak: "break-word",
            }}
          >
            {sound.name}
          </span>
        </Button>

        <Button
          variant="ghost"
          size="icon-xs"
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          style={{ position: "absolute", top: 4, right: 4 }}
          onClick={() => onToggleFavorite(sound.id)}
        >
          <Heart
            color={isFavorite ? FAVORITE_COLOR : "var(--muted-foreground)"}
            fill={isFavorite ? FAVORITE_COLOR : "none"}
          />
        </Button>

        {canEditHotkey ? (
          <SoundHotkeyButton soundId={sound.id} compact />
        ) : (
          <SoundHotkeyLabel soundId={sound.id} />
        )}

        {showCooldown && <CooldownBar />}
      </div>
    );
  },
);

type TGroupHeadingProps = {
  title: string;
  isCollapsed: boolean;
  onToggle: () => void;
};

const GroupHeading = ({ title, isCollapsed, onToggle }: TGroupHeadingProps) => {
  const Chevron = isCollapsed ? ChevronRight : ChevronDown;

  return (
    <button
      type="button"
      title={isCollapsed ? "Show" : "Hide"}
      onClick={onToggle}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: 0,
        background: "none",
        border: "none",
        cursor: "pointer",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "var(--muted-foreground)",
      }}
    >
      <Chevron size={12} />
      {title}
    </button>
  );
};

/** `list` with `id` added, or taken out if already in it. */
const toggleId = (list: string[], id: string) =>
  list.includes(id) ? list.filter((other) => other !== id) : [...list, id];

type TSoundPickerProps = {
  /** caps the grid inside the popover; a detached window scrolls instead */
  gridMaxHeight?: number;
  /** a picker in the detached window cannot open popovers there */
  isDetached?: boolean;
  onAdd?: () => void;
  onDetach?: () => void;
};

const SoundPicker = memo((props: TSoundPickerProps) => {
  const { gridMaxHeight, isDetached, onAdd, onDetach } = props;
  const { data, save } = useUserData<TSharkord>();
  const { sounds, categories } = useSoundboard();
  const cooldown = useCooldown();
  const { error, run } = useErrorState();
  const playbackOptions = usePlaybackOptions();
  const [search, setSearch] = useState("");

  // the shared empty list, not a new one per render, which would make every
  // memo below that depends on it run again each time
  const {
    favorites = NO_IDS,
    recent = NO_IDS,
    collapsed = NO_IDS,
  } = data;
  const query = search.trim().toLowerCase();
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const groups = useMemo(
    () =>
      groupSounds(
        sounds.filter((sound) => sound.name.toLowerCase().includes(query)),
        categories,
        favorites,
        recent,
      ),
    [sounds, categories, favorites, recent, query],
  );

  // a search shows every match, folded groups included
  const isCollapsed = (groupId: string) =>
    !query && collapsed.includes(groupId);

  // stable, so a search keystroke or a play renders the picker, not every
  // one of its cards
  const onPlay = useStableCallback((soundId: string) =>
    run(() => requestPlay(soundId)),
  );

  const onPreview = useStableCallback((soundId: string) =>
    run(() => playSound(soundId, playbackOptions)),
  );

  const onToggleFavorite = useStableCallback((soundId: string) =>
    save({ ...data, favorites: toggleId(favorites, soundId) }),
  );

  const onToggleGroup = (groupId: string) =>
    save({ ...data, collapsed: toggleId(collapsed, groupId) });

  // the first card on screen: with a search, the best match
  const playTopMatch = () => {
    const top = groups.find((group) => !isCollapsed(group.id))?.sounds[0];

    if (top && !cooldown.isActive) onPlay(top.id);
  };

  return (
    <Stack
      gap={8}
      // in its own window, the picker is the window's height, and the
      // sounds take whatever search and volume leave and scroll in it
      style={
        isDetached
          ? { display: "flex", flexDirection: "column", height: "100%" }
          : undefined
      }
    >
      <Row>
        <Input
          placeholder="Search sounds"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onEnter={playTopMatch}
          // in the popover, Escape also closes it, which clears it anyway
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("");
          }}
          autoFocus
        />
        {onAdd && (
          <IconButton
            icon={Plus}
            title="Add a sound"
            onClick={onAdd}
            size="sm"
          />
        )}
        {onDetach && (
          <IconButton
            icon={PictureInPicture2}
            title="Open in a separate window"
            size="sm"
            onClick={() => run(async () => onDetach())}
          />
        )}
      </Row>

      <Stack
        gap={12}
        style={{
          maxHeight: gridMaxHeight,
          overflowY: "auto",
          ...(isDetached && { flex: 1, minHeight: 0, alignContent: "start" }),
        }}
      >
        {groups.map((group) => (
          <Stack key={group.id} gap={6}>
            {group.title && (
              <GroupHeading
                title={group.title}
                isCollapsed={isCollapsed(group.id)}
                onToggle={() => onToggleGroup(group.id)}
              />
            )}
            {!isCollapsed(group.id) && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
                gap: GRID_GAP,
              }}
            >
              {group.sounds.map((sound) => (
                <SoundCard
                  key={sound.id}
                  sound={sound}
                  isFavorite={favoriteSet.has(sound.id)}
                  disabled={cooldown.isActive}
                  showCooldown={
                    cooldown.isActive && cooldown.soundId === sound.id
                  }
                  canEditHotkey={!isDetached}
                  onPlay={onPlay}
                  onPreview={onPreview}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
            )}
          </Stack>
        ))}
      </Stack>

      {groups.length === 0 && (
        <MutedText>
          {sounds.length === 0
            ? "No sounds yet."
            : "No sound matches your search."}
        </MutedText>
      )}

      <ErrorText error={error} />

      <VolumeControl />
    </Stack>
  );
});

// what is playing in the voice channel, as opposed to previews
const channelSources = new Set<AudioBufferSourceNode>();

const VoiceControls = memo(({ channelId }: { channelId: number }) => {
  const { sounds } = useSoundboard();
  const canUpload = useCanUpload();
  const playbackOptions = usePlaybackOptions();
  const deafened = useStoreSelector((state) => state.ownVoiceState.soundMuted);
  const ownUserId = useStoreSelector((state) => state.ownUserId);
  const { data, save } = useUserData<TSharkord>();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // lives outside the popover, which unmounts its content when it closes
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  // rendered here too, so leaving voice closes the window with the rest
  const [detachedWindow, setDetachedWindow] = useState<Window>();

  // the recent list waiting to be saved, newest first
  const pendingRecent = useRef<string[]>(undefined);
  const recentTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flushRecent = useStableCallback(() => {
    clearTimeout(recentTimer.current);

    if (!pendingRecent.current) return;

    save({ ...data, recent: pendingRecent.current }).catch(() => {});
    pendingRecent.current = undefined;
  });

  const recordRecent = (soundId: string) => {
    const recent = pendingRecent.current ?? data.recent ?? NO_IDS;

    pendingRecent.current = [
      soundId,
      ...recent.filter((id) => id !== soundId),
    ].slice(0, MAX_RECENT);

    clearTimeout(recentTimer.current);
    recentTimer.current = setTimeout(flushRecent, RECENT_SAVE_DELAY_MS);
  };

  // what is waiting is saved on leaving voice, not lost
  useEffect(() => flushRecent, [flushRecent]);

  // mounted for as long as the user is in voice, so this hears every sound
  // played in their channel, whether the popover is open or not
  usePush<TSharkord>(async (push) => {
    if (push.type !== "play") return;

    // tracked even while deafened: it says who played, not what you hear
    setPlaying(
      push.userId,
      {
        soundId: push.soundId,
        soundName: push.soundName,
        showBadge: push.showBadge,
      },
      push.durationMs,
    );

    // heard here, so popover, detached window and hotkeys all count
    if (push.userId === ownUserId) recordRecent(push.soundId);

    if (deafened) return;

    const source = await playSound(push.soundId, playbackOptions).catch(
      () => undefined,
    );

    if (!source) return;

    channelSources.add(source);
    source.onended = () => channelSources.delete(source);
  });

  // the channel's sounds stop with it: on leaving voice, which unmounts this,
  // and on moving straight to another channel
  useEffect(
    () => () => {
      channelSources.forEach((source) => source.stop());
      channelSources.clear();
      clearPlaying();
    },
    [channelId],
  );

  // stable, so the picker is not rendered again with every play
  const openUpload = useStableCallback(() => {
    setIsPickerOpen(false);
    setIsUploadOpen(true);
  });

  useDetachedWindowLifecycle(detachedWindow, () =>
    setDetachedWindow(undefined),
  );

  const detach = useStableCallback(() => {
    setDetachedWindow(
      openDetachedWindow(
        DETACHED_WINDOW_SIZE.width,
        DETACHED_WINDOW_SIZE.height,
      ),
    );
    setIsPickerOpen(false);
  });

  return (
    <>
      <Popover open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-md transition-all duration-200 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground"
            title="Soundboard"
          >
            <AudioLines className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          style={{ width: POPOVER_WIDTH }}
        >
          <SoundPicker
            gridMaxHeight={POPOVER_GRID_MAX_HEIGHT}
            onAdd={canUpload ? openUpload : undefined}
            onDetach={detachedWindow ? undefined : detach}
          />
        </PopoverContent>
      </Popover>

      {detachedWindow && (
        <DetachedWindow popup={detachedWindow} title="Soundboard">
          <SoundPicker isDetached />
        </DetachedWindow>
      )}

      {/* here, mounted once for as long as the user is in voice */}
      <SoundHotkeys sounds={sounds} />

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent
          close={() => setIsUploadOpen(false)}
          // room for the waveform and a batch's stepper; still fits a phone
          style={{ maxWidth: UPLOAD_DIALOG_MAX_WIDTH }}
        >
          <DialogHeader>
            <DialogTitle>Add a sound</DialogTitle>
          </DialogHeader>
          <UploadForm onUploaded={() => setIsUploadOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
});

export { VoiceControls };
