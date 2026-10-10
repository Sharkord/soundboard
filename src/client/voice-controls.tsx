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
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { TSharkord, TSound } from "../contract";
import {
  callAction,
  useCanUpload,
  useErrorState,
  usePlaybackOptions,
  type TUserDataState,
  useSoundboard,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";
import { playSound } from "./audio";
import {
  DetachedWindow,
  openDetachedWindow,
  useDetachedWindowLifecycle,
} from "./detached-window";
import { clearPlaying, setPlaying } from "./player-badge";
import { UploadForm } from "./upload-form";
import { VolumeControl } from "./volume-control";

const FAVORITE_COLOR = "#ef4444";

const GRID_COLUMNS = 4;

// shared by every picker, so closing and reopening the popover does not
// re-enable the buttons early
let cooldownUntil = 0;

/** Whether the user's last play is still cooling down, as the server counts it. */
const useCooldown = () => {
  const [isCoolingDown, setIsCoolingDown] = useState(
    () => Date.now() < cooldownUntil,
  );

  useEffect(() => {
    if (!isCoolingDown) return;

    const timeout = setTimeout(
      () => setIsCoolingDown(false),
      cooldownUntil - Date.now(),
    );

    return () => clearTimeout(timeout);
  }, [isCoolingDown]);

  const startCooldown = useCallback((cooldownMs: number) => {
    cooldownUntil = Date.now() + cooldownMs;
    setIsCoolingDown(cooldownMs > 0);
  }, []);

  return { isCoolingDown, startCooldown };
};

type TSoundCardProps = {
  sound: TSound;
  isFavorite: boolean;
  disabled: boolean;
  onPlay: (soundId: string) => void;
  onToggleFavorite: (soundId: string) => void;
};

const SoundCard = memo(
  ({
    sound,
    isFavorite,
    disabled,
    onPlay,
    onToggleFavorite,
  }: TSoundCardProps) => (
    <div style={{ position: "relative", aspectRatio: "1 / 1" }}>
      <Button
        variant="secondary"
        title={sound.name}
        disabled={disabled}
        style={{
          width: "100%",
          height: "100%",
          padding: 6,
          whiteSpace: "normal",
          fontSize: 12,
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
    </div>
  ),
);

type TSoundPickerProps = {
  userData: TUserDataState;
  /** caps the grid inside the popover; a detached window scrolls instead */
  gridMaxHeight?: number;
  onAdd?: () => void;
  onDetach?: () => void;
};

const SoundPicker = memo((props: TSoundPickerProps) => {
  const { userData, gridMaxHeight, onAdd, onDetach } = props;
  const { data, save } = userData;
  const { sounds } = useSoundboard();
  const { isCoolingDown, startCooldown } = useCooldown();
  const { error, run } = useErrorState();
  const [search, setSearch] = useState("");

  const favorites = data.favorites ?? [];

  const visibleSounds = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sounds
      .filter((sound) => sound.name.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(favorites.includes(b.id)) - Number(favorites.includes(a.id)) ||
          a.name.localeCompare(b.name),
      );
  }, [sounds, favorites, search]);

  const onPlay = (soundId: string) =>
    run(async () => {
      const { cooldownMs } = await callAction("playSound", { soundId });

      startCooldown(cooldownMs);
    });

  const onToggleFavorite = (soundId: string) =>
    save({
      ...data,
      favorites: favorites.includes(soundId)
        ? favorites.filter((id) => id !== soundId)
        : [...favorites, soundId],
    });

  return (
    <Stack gap={8}>
      <Row>
        <Input
          placeholder="Search sounds"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoFocus
        />
        {onAdd && (
          <IconButton icon={Plus} title="Add a sound" onClick={onAdd} />
        )}
        {onDetach && (
          <IconButton
            icon={PictureInPicture2}
            title="Open in a separate window"
            // the picker shows it when the browser refuses the window
            onClick={() => run(async () => onDetach())}
          />
        )}
      </Row>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`,
          gap: 6,
          maxHeight: gridMaxHeight,
          overflowY: "auto",
        }}
      >
        {visibleSounds.map((sound) => (
          <SoundCard
            key={sound.id}
            sound={sound}
            isFavorite={favorites.includes(sound.id)}
            disabled={isCoolingDown}
            onPlay={onPlay}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>

      {visibleSounds.length === 0 && (
        <MutedText>
          {sounds.length === 0
            ? "No sounds yet."
            : "No sound matches your search."}
        </MutedText>
      )}

      <ErrorText error={error} />

      <VolumeControl userData={userData} />
    </Stack>
  );
});

// what is playing in the voice channel, as opposed to previews
const channelSources = new Set<AudioBufferSourceNode>();

const VoiceControls = memo(({ channelId }: { channelId: number }) => {
  const canUpload = useCanUpload();
  // held here and handed to the picker, so the volume it saves is the one
  // the sounds below play at
  const userData = useUserData<TSharkord>();
  const playbackOptions = usePlaybackOptions(userData.data);
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

    // shown even while deafened: it says who played, not what you hear
    if (push.showBadge) {
      setPlaying(push.userId, push.soundName, push.durationMs);
    }

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
    setDetachedWindow(openDetachedWindow(420, 560));
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
        <PopoverContent side="top" align="start" style={{ width: 360 }}>
          <SoundPicker
            userData={userData}
            gridMaxHeight={300}
            onAdd={canUpload ? openUpload : undefined}
            onDetach={detachedWindow ? undefined : detach}
          />
        </PopoverContent>
      </Popover>

      {detachedWindow && (
        <DetachedWindow popup={detachedWindow} title="Soundboard">
          <SoundPicker userData={userData} />
        </DetachedWindow>
      )}

      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent close={() => setIsUploadOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add a sound</DialogTitle>
          </DialogHeader>
          <UploadForm
            userData={userData}
            onUploaded={() => setIsUploadOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
});

export { VoiceControls };
