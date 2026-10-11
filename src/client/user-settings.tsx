import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import { memo, useCallback, useMemo } from "react";
import { SoundList } from "./sound-list";
import { callAction, useCanUpload, useSoundboard } from "./store";
import { Section, Stack } from "./ui";
import { UploadForm } from "./upload-form";
import { VolumeControl } from "./volume-control";

const UserSettings = memo(() => {
  const canUpload = useCanUpload();
  const ownUserId = useStoreSelector((state) => state.ownUserId);
  const { sounds } = useSoundboard();

  const ownSounds = useMemo(
    () => sounds.filter((sound) => sound.uploaderId === ownUserId),
    [sounds, ownUserId],
  );

  const onDelete = useCallback(
    (soundId: string) => callAction("deleteSound", { soundId }),
    [],
  );

  const onRename = useCallback(
    (soundId: string, name: string) =>
      callAction("renameSound", { soundId, name }),
    [],
  );

  return (
    <Stack gap={24} style={{ padding: 16 }}>
      <Section title="Volume">
        <VolumeControl />
      </Section>

      {canUpload && (
        <Section title="Upload a sound">
          <UploadForm />
        </Section>
      )}

      <Section title="Your sounds">
        <SoundList
          sounds={ownSounds}
          showUploader={false}
          onDelete={onDelete}
          onRename={onRename}
          emptyText="You have not uploaded any sounds."
        />
      </Section>
    </Stack>
  );
});

export { UserSettings };
