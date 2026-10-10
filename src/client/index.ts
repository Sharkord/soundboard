import { PluginSlot } from "@sharkord/plugin-sdk";
import type {
  TPluginComponentsMapBySlotId,
  TPluginTabs,
} from "@sharkord/plugin-sdk/client";
import { AdminTab } from "./admin-tab";
import { UserSettings } from "./user-settings";
import { VoiceControls } from "./voice-controls";

const components: TPluginComponentsMapBySlotId = {
  [PluginSlot.VOICE_CONTROLS]: [VoiceControls],
  [PluginSlot.USER_SETTINGS]: [UserSettings],
};

const tabs: TPluginTabs = [
  { id: "sounds", label: "Sounds", component: AdminTab },
];

export { components, tabs };
