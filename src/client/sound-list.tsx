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
} from "@sharkord/ui";
import { Play, Trash2 } from "lucide-react";
import { memo } from "react";
import type { TSound } from "../contract";
import { playSound } from "./audio";
import {
  formatDuration,
  usePlaybackOptions,
  useErrorState,
  useUserName,
  type TUserDataState,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";

type TSoundRowProps = {
  sound: TSound;
  showUploader: boolean;
  /** the parent's, when it lets the user change the volume */
  userData?: TUserDataState;
  onDelete: (soundId: string) => Promise<void>;
};

const SoundRow = memo((props: TSoundRowProps) => {
  const { sound, showUploader, userData, onDelete } = props;
  const uploaderName = useUserName(sound.uploaderId);
  const { error, run } = useErrorState();
  const playbackOptions = usePlaybackOptions(userData?.data);

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
        <span style={{ fontWeight: 500 }}>{sound.name}</span>
        <MutedText>
          {formatDuration(sound.durationMs)}
          {showUploader && ` · ${uploaderName ?? "Unknown user"}`}
        </MutedText>
        <ErrorText error={error} />
      </Stack>

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

const SoundList = memo(({ sounds, emptyText, ...rowProps }: TSoundListProps) => (
  <Stack gap={6}>
    {sounds.map((sound) => (
      <SoundRow key={sound.id} sound={sound} {...rowProps} />
    ))}

    {sounds.length === 0 && <MutedText>{emptyText}</MutedText>}
  </Stack>
));

export { SoundList };
