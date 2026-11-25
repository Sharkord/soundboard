import { SettingsSection } from "@sharkord/ui";
import { useStoreSelector } from "@sharkord/plugin-sdk/client";
import { memo, useCallback, useMemo } from "react";
import type { TSoundChanges } from "../contract";
import { SoundList } from "./sound-list";
import { callAction, useCanUpload, useSoundboard } from "./store";
import { Stack } from "./ui";
import { UploadForm } from "./upload-form";
import { VolumeControl } from "./volume-control";

const UserSettings = memo(() => {
  const canUpload = useCanUpload();
  const ownUserId = useStoreSelector((state) => state.ownUserId);
  const { sounds, categories } = useSoundboard();

  const ownSounds = useMemo(
    () => sounds.filter((sound) => sound.uploaderId === ownUserId),
    [sounds, ownUserId],
  );

  const onDelete = useCallback(
    (soundId: string) => callAction("deleteSound", { soundId }),
    [],
  );

  const onUpdate = useCallback(
    (soundId: string, changes: TSoundChanges) =>
      callAction("updateSound", { soundId, changes }),
    [],
  );

  return (
    <Stack gap={24} style={{ padding: 16 }}>
      <SettingsSection title="Volume">
        <VolumeControl />
      </SettingsSection>

      {canUpload && (
        <SettingsSection title="Upload a sound">
          <UploadForm />
        </SettingsSection>
      )}

      <SettingsSection title="Your sounds">
        <SoundList
          sounds={ownSounds}
          showUploader={false}
          showHotkey
          onDelete={onDelete}
          onUpdate={onUpdate}
          categories={categories}
          emptyText="You have not uploaded any sounds."
        />
      </SettingsSection>
    </Stack>
  );
});

export { UserSettings };
