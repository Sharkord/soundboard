import { memo, useCallback } from "react";
import type { TSoundChanges } from "../contract";
import { CategoryManager } from "./categories";
import { SoundList } from "./sound-list";
import { callAction, useSoundboard } from "./store";
import { MutedText, Section, Stack } from "./ui";

const AdminTab = memo(() => {
  const { sounds, categories } = useSoundboard();

  const onDelete = useCallback(
    (soundId: string) => callAction("deleteAnySound", { soundId }),
    [],
  );

  const onUpdate = useCallback(
    (soundId: string, changes: TSoundChanges) =>
      callAction("updateAnySound", { soundId, changes }),
    [],
  );

  return (
    <Stack gap={24} style={{ padding: 16 }}>
      <Section title="Categories">
        <CategoryManager categories={categories} />
      </Section>

      <Section title="Sounds">
        <MutedText>{sounds.length} sound(s) uploaded on this server.</MutedText>

        <SoundList
          sounds={sounds}
          categories={categories}
          showUploader
          onDelete={onDelete}
          onUpdate={onUpdate}
          emptyText="Nobody has uploaded a sound yet."
        />
      </Section>
    </Stack>
  );
});

export { AdminTab };
