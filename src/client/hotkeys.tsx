import {
  useHotkey,
  useHotkeyBinding,
  useStoreSelector,
} from "@sharkord/plugin-sdk/client";
import {
  Button,
  HotkeyInput,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@sharkord/ui";
import { Keyboard } from "lucide-react";
import { memo } from "react";
import type { TSound } from "../contract";
import { requestPlay } from "./cooldown";
import { MutedText, Stack } from "./ui";

// a sound's id never changes, so neither does its hotkey, renames included
const getHotkeyId = (soundId: string) => `play-${soundId}`;

/**
 * Whether the user turned hotkeys on in their settings. Every control for
 * binding a key hides while it is off: a bound key would do nothing.
 */
const useHotkeysEnabled = () =>
  useStoreSelector((state) => state.hotkeysEnabled);

const SoundHotkey = memo(({ sound }: { sound: TSound }) => {
  useHotkey(
    { id: getHotkeyId(sound.id), label: `Play "${sound.name}"` },
    // nowhere to show an error from a key press: the cooldown already
    // keeps it from firing when the server would refuse
    () => requestPlay(sound.id).catch(() => {}),
  );

  return null;
});

/**
 * Makes every sound playable by its hotkey. Mount it exactly once, where the
 * user can play: two mounts would register each key twice and play it twice.
 */
const SoundHotkeys = memo(({ sounds }: { sounds: TSound[] }) =>
  sounds.map((sound) => <SoundHotkey key={sound.id} sound={sound} />),
);

/** The key bound to a sound, small, for its card. Nothing while unbound. */
const SoundHotkeyLabel = memo(({ soundId }: { soundId: string }) => {
  const { display } = useHotkeyBinding(getHotkeyId(soundId));
  const isEnabled = useHotkeysEnabled();

  if (!display || !isEnabled) return null;

  return (
    <span
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        fontSize: 10,
        lineHeight: 1,
        color: "var(--muted-foreground)",
        pointerEvents: "none",
      }}
    >
      {display}
    </span>
  );
});

type TSoundHotkeyButtonProps = {
  soundId: string;
  /** for a sound card's corner: the bound key itself, or a faint icon */
  compact?: boolean;
};

/** Opens a key recorder for one sound. */
const SoundHotkeyButton = memo(
  ({ soundId, compact }: TSoundHotkeyButtonProps) => {
    const binding = useHotkeyBinding(getHotkeyId(soundId));
    const { display } = binding;
    const isEnabled = useHotkeysEnabled();
    const title = display ? `Hotkey: ${display}` : "Set a hotkey";

    if (!isEnabled) return null;

    return (
      <Popover>
        <PopoverTrigger asChild>
          {compact ? (
            <Button
              variant="ghost"
              size="icon-xs"
              title={title}
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                width: "auto",
                minWidth: 16,
                padding: display ? "0 3px" : 0,
                fontSize: 10,
                color: "var(--muted-foreground)",
              }}
            >
              {display ?? <Keyboard />}
            </Button>
          ) : (
            <IconButton
              icon={Keyboard}
              size="sm"
              variant={display ? "primary" : "ghost"}
              title={title}
            />
          )}
        </PopoverTrigger>
        <PopoverContent style={{ width: "auto", maxWidth: 280 }}>
          <Stack gap={8}>
            <MutedText>
              Plays this sound while you are in a voice channel, without opening
              the soundboard.
            </MutedText>
            <HotkeyInput {...binding} />
          </Stack>
        </PopoverContent>
      </Popover>
    );
  },
);

export { SoundHotkeyButton, SoundHotkeyLabel, SoundHotkeys };
