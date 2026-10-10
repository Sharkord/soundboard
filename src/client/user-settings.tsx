import { useStoreSelector, useUserData } from "@sharkord/plugin-sdk/client";
import type { TSharkord } from "../contract";
import { memo, useCallback, useMemo } from "react";
import { SoundList } from "./sound-list";
import { callAction, useCanUpload, useSoundboard } from "./store";
import { Section, Stack } from "./ui";
import { UploadForm } from "./upload-form";
import { VolumeControl } from "./volume-control";

const UserSettings = memo(() => {
  const canUpload = useCanUpload();
  // one copy for the whole page, so previews play at the volume set here
  const userData = useUserData<TSharkord>();
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

  return (
    <Stack gap={24} style={{ padding: 16 }}>
      <Section title="Volume">
        <VolumeControl userData={userData} />
      </Section>

      {canUpload && (
        <Section title="Upload a sound">
          <UploadForm userData={userData} />
        </Section>
      )}

      <Section title="Your sounds">
        <SoundList
          sounds={ownSounds}
          showUploader={false}
          userData={userData}
          onDelete={onDelete}
          emptyText="You have not uploaded any sounds."
        />
      </Section>
    </Stack>
  );
});

export { UserSettings };
