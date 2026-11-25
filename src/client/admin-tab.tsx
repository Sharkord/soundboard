import { SettingsSection } from "@sharkord/ui";
import { usePush } from "@sharkord/plugin-sdk/client";
import { memo, useCallback, useEffect, useState } from "react";
import type { TSharkord, TSoundChanges } from "../contract";
import { CategoryManager } from "./categories";
import { SoundList } from "./sound-list";
import { callAction, useSoundboard } from "./store";
import { MutedText, Stack } from "./ui";

const AdminTab = memo(() => {
  const { sounds, categories } = useSoundboard();
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});

  const refreshPlayCounts = useCallback(() => {
    callAction("getPlayCounts")
      .then(setPlayCounts)
      .catch(() => {});
  }, []);

  useEffect(refreshPlayCounts, [refreshPlayCounts]);

  // ponytail: counts are as of opening the tab (or the last sound change);
  // push plays to admins too if they need to watch them tick live
  usePush<TSharkord>((push) => {
    if (push.type === "changed") refreshPlayCounts();
  });

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
      <SettingsSection title="Categories">
        <CategoryManager categories={categories} />
      </SettingsSection>

      <SettingsSection title="Sounds">
        <MutedText>{sounds.length} sound(s) uploaded on this server.</MutedText>

        <SoundList
          sounds={sounds}
          categories={categories}
          showUploader
          filterable
          playCounts={playCounts}
          onDelete={onDelete}
          onUpdate={onUpdate}
          emptyText="Nobody has uploaded a sound yet."
        />
      </SettingsSection>
    </Stack>
  );
});

export { AdminTab };
