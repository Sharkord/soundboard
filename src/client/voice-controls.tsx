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
import { AudioLines, Heart, PictureInPicture2, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import type { TSharkord, TSound } from "../contract";
import { groupSounds } from "../groups";
import {
  useCanUpload,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
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

type TSoundCardProps = {
  sound: TSound;
  isFavorite: boolean;
  disabled: boolean;
  /** the card of the sound the user played, which shows the cooldown */
  showCooldown: boolean;
  /** false in the detached window, where a popover would open in the main one */
  canEditHotkey: boolean;
  onPlay: (soundId: string) => void;
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
    onToggleFavorite,
  }: TSoundCardProps) => {
    const isPlaying = useIsSoundPlaying(sound.id);

    return (
      <div style={{ position: "relative", aspectRatio: "1 / 1" }}>
        <Button
          // lit up while it plays in the channel, whoever played it
          variant={isPlaying ? "default" : "secondary"}
          title={sound.name}
          disabled={disabled}
          style={{
            width: "100%",
            height: "100%",
            padding: 6,
            whiteSpace: "normal",
            fontSize: 13,
            lineHeight: 1.2,
          }}
          onClick={() => onPlay(sound.id)}
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

const GroupHeading = ({ children }: { children: string }) => (
  <span
    style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color: "var(--muted-foreground)",
    }}
  >
    {children}
  </span>
);

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
  const [search, setSearch] = useState("");

  const favorites = data.favorites ?? [];

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase();

    return groupSounds(
      sounds.filter((sound) => sound.name.toLowerCase().includes(query)),
      categories,
      favorites,
    );
  }, [sounds, categories, favorites, search]);

  const onPlay = (soundId: string) => run(() => requestPlay(soundId));

  const onToggleFavorite = (soundId: string) =>
    save({
      ...data,
      favorites: favorites.includes(soundId)
        ? favorites.filter((id) => id !== soundId)
        : [...favorites, soundId],
    });

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
          <Stack key={group.title ?? "all"} gap={6}>
            {group.title && <GroupHeading>{group.title}</GroupHeading>}
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
                  isFavorite={favorites.includes(sound.id)}
                  disabled={cooldown.isActive}
                  showCooldown={
                    cooldown.isActive && cooldown.soundId === sound.id
                  }
                  canEditHotkey={!isDetached}
                  onPlay={onPlay}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </div>
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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  // lives outside the popover, which unmounts its content when it closes
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  // rendered here too, so leaving voice closes the window with the rest
  const [detachedWindow, setDetachedWindow] = useState<Window>();

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

  const openUpload = () => {
    setIsPickerOpen(false);
    setIsUploadOpen(true);
  };

  useDetachedWindowLifecycle(detachedWindow, () =>
    setDetachedWindow(undefined),
  );

  const detach = () => {
    setDetachedWindow(
      openDetachedWindow(
        DETACHED_WINDOW_SIZE.width,
        DETACHED_WINDOW_SIZE.height,
      ),
    );
    setIsPickerOpen(false);
  };

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
        <DialogContent close={() => setIsUploadOpen(false)}>
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
