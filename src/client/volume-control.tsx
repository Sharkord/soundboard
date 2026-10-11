import { useUserData } from "@sharkord/plugin-sdk/client";
import { IconButton, Slider } from "@sharkord/ui";
import { Volume2, VolumeX } from "lucide-react";
import { memo, useState } from "react";
import type { TSharkord } from "../contract";
import { DEFAULT_VOLUME } from "./store";
import { Row } from "./ui";

const VolumeControl = memo(() => {
  const { data, save } = useUserData<TSharkord>();
  // the slider moves locally and saves on release, not on every step
  const [volume, setVolume] = useState<number>();

  const isMuted = data.muted ?? false;

  return (
    <Row>
      <IconButton
        icon={isMuted ? VolumeX : Volume2}
        size="sm"
        variant="ghost"
        title={isMuted ? "Unmute sounds" : "Mute sounds"}
        onClick={() => save({ ...data, muted: !isMuted })}
      />
      <Slider
        min={0}
        max={100}
        value={[
          Math.round(
            (volume ?? (isMuted ? 0 : (data.volume ?? DEFAULT_VOLUME))) * 100,
          ),
        ]}
        onValueChange={([value = 0]) => setVolume(value / 100)}
        // moving the slider is choosing a volume, so it unmutes too
        onValueCommit={async ([value = 0]) => {
          await save({ ...data, volume: value / 100, muted: false });
          setVolume(undefined);
        }}
      />
    </Row>
  );
});

export { VolumeControl };
