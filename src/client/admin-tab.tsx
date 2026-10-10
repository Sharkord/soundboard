import { memo, useCallback } from "react";
import { SoundList } from "./sound-list";
import { callAction, useSoundboard } from "./store";
import { MutedText, Stack } from "./ui";

const AdminTab = memo(() => {
  const { sounds } = useSoundboard();

  const onDelete = useCallback(
    (soundId: string) => callAction("deleteAnySound", { soundId }),
    [],
  );

  return (
    <Stack style={{ padding: 16 }}>
      <MutedText>{sounds.length} sound(s) uploaded on this server.</MutedText>

      <SoundList
        sounds={sounds}
        showUploader
        onDelete={onDelete}
        emptyText="Nobody has uploaded a sound yet."
      />
    </Stack>
  );
});

export { AdminTab };
