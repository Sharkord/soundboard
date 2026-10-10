import { PluginSlot } from "@sharkord/plugin-sdk";
import type {
  TPluginComponentsMapBySlotId,
  TPluginTabs,
} from "@sharkord/plugin-sdk/client";
import { AdminTab } from "./admin-tab";
import { VoiceUserCardBadge, VoiceUserRowBadge } from "./player-badge";
import { UserSettings } from "./user-settings";
import { VoiceControls } from "./voice-controls";

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.VOICE_CONTROLS]: [VoiceControls],
  [PluginSlot.USER_SETTINGS]: [UserSettings],
  [PluginSlot.VOICE_USER_CARD]: [VoiceUserCardBadge],
  [PluginSlot.VOICE_USER_ROW]: [VoiceUserRowBadge],
};

const tabs: TPluginTabs = [
  { id: "sounds", label: "Sounds", component: AdminTab },
];

export { components, tabs };
