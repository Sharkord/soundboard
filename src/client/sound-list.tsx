import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  IconButton,
  Input,
} from "@sharkord/ui";
import { Pencil, Play, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import {
  MAX_NAME_LENGTH,
  type TCategory,
  type TSound,
  type TSoundChanges,
} from "../contract";
import { playSound } from "./audio";
import { CategorySelect } from "./categories";
import { SoundHotkeyButton } from "./hotkeys";
import {
  formatDuration,
  useErrorState,
  usePlaybackOptions,
  useUserName,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";

type TSoundRowProps = {
  sound: TSound;
  categories: TCategory[];
  showUploader: boolean;
  /** lets the user bind a key to the sound, for their own list */
  showHotkey?: boolean;
  onDelete: (soundId: string) => Promise<void>;
  onUpdate: (soundId: string, changes: TSoundChanges) => Promise<void>;
};

const SoundRow = memo((props: TSoundRowProps) => {
  const { sound, categories, showUploader, showHotkey, onDelete, onUpdate } =
    props;
  const uploaderName = useUserName(sound.uploaderId);
  const { error, run } = useErrorState();
  const playbackOptions = usePlaybackOptions();
  // the name being typed, while renaming
  const [draftName, setDraftName] = useState<string>();

  const saveName = () =>
    run(async () => {
      if (draftName === undefined) return;

      setDraftName(undefined);

      if (draftName.trim() !== sound.name) {
        await onUpdate(sound.id, { name: draftName });
      }
    });

  return (
    <Row
      gap={12}
      style={{
        padding: "8px 12px",
        borderRadius: "var(--radius)",
        background: "var(--secondary)",
      }}
    >
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        {draftName === undefined ? (
          <span style={{ fontWeight: 500 }}>{sound.name}</span>
        ) : (
          <Input
            value={draftName}
            maxLength={MAX_NAME_LENGTH}
            autoFocus
            onChange={(event) => setDraftName(event.target.value)}
            onEnter={saveName}
            onBlur={saveName}
            onKeyUp={(event) => {
              if (event.key === "Escape") setDraftName(undefined);
            }}
          />
        )}
        <MutedText>
          {formatDuration(sound.durationMs)}
          {showUploader && ` · ${uploaderName ?? "Unknown user"}`}
        </MutedText>
        <ErrorText error={error} />
      </Stack>

      <CategorySelect
        categories={categories}
        value={sound.categoryId}
        size="sm"
        onChange={(categoryId) =>
          run(() => onUpdate(sound.id, { categoryId: categoryId ?? null }))
        }
      />

      {showHotkey && <SoundHotkeyButton soundId={sound.id} />}

      <IconButton
        icon={Pencil}
        size="sm"
        variant="ghost"
        title="Rename"
        onClick={() => setDraftName(sound.name)}
      />

      <IconButton
        icon={Play}
        size="sm"
        variant="ghost"
        title="Preview (only you hear it)"
        onClick={() => run(() => playSound(sound.id, playbackOptions))}
      />

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <IconButton
            icon={Trash2}
            size="sm"
            variant="destructive"
            title="Delete"
          />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{sound.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              It is removed for everyone and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => onDelete(sound.id))}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Row>
  );
});

type TSoundListProps = Omit<TSoundRowProps, "sound"> & {
  sounds: TSound[];
  emptyText: string;
};

const SoundList = memo(
  ({ sounds, emptyText, ...rowProps }: TSoundListProps) => (
    <Stack gap={6}>
      {sounds.map((sound) => (
        <SoundRow key={sound.id} sound={sound} {...rowProps} />
      ))}

      {sounds.length === 0 && <MutedText>{emptyText}</MutedText>}
    </Stack>
  ),
);

export { SoundList };
