import { Permission, type PluginContext } from "@sharkord/plugin-sdk";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import type { IncomingMessage, ServerResponse } from "http";
import path from "path";
import { MAX_NAME_LENGTH, type TSharkord, type TSound } from "../contract";
import { getErrorMessage } from "../helpers";
import { getOggOpusDurationMs } from "../ogg";

// a shortcode, not the 🔊 character: the client draws a reaction by looking
// its name up, and a raw character finds nothing and renders broken
const PLAYER_REACTION_EMOJI = "loud_sound";

/** The name to store, or throws why it is not one. */
const validateName = (name: unknown): string => {
  const trimmed = typeof name === "string" ? name.trim() : "";

  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`The name must be 1 to ${MAX_NAME_LENGTH} characters.`);
  }

  return trimmed;
};

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

const readBody = async (
  req: IncomingMessage,
  maxBytes: number,
): Promise<Uint8Array> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;

    if (size > maxBytes) {
      throw new Error("The sound is too large.");
    }

    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
};

const onLoad = async (ctx: PluginContext<TSharkord>) => {
  const settings = await ctx.settings.register([
    {
      key: "maxDurationSeconds",
      name: "Maximum length (seconds)",
      description: "The longest sound anyone can upload.",
      type: "number",
      defaultValue: 10,
    },
    {
      key: "maxFileSizeKb",
      name: "Maximum file size (KB)",
      description:
        "The largest sound anyone can upload. Sounds are stored as mono Opus, about 10KB per second.",
      type: "number",
      defaultValue: 256,
    },
    {
      key: "maxSoundsPerUser",
      name: "Sounds per user",
      description: "How many sounds each user can upload.",
      type: "number",
      defaultValue: 20,
    },
    {
      key: "cooldownSeconds",
      name: "Cooldown (seconds)",
      description:
        "How long a user waits between two sounds. A sound longer than this blocks the next one until it ends, so 0 means only that.",
      type: "number",
      defaultValue: 0,
    },
    {
      key: "normalizeLoudness",
      name: "Normalize loudness",
      description:
        "Bring every uploaded sound to about the same loudness, so none is drowned out or deafening next to the others. Applies to new uploads only.",
      type: "boolean",
      defaultValue: true,
    },
    {
      key: "playerIndicator",
      name: "Show who played a sound",
      description:
        "How the voice channel sees who played a sound: a badge on their card and sidebar row for as long as it plays, or a floating emoji like a reaction.",
      type: "enum",
      defaultValue: "both",
      options: [
        { value: "badge", label: "Badge on the player" },
        { value: "reaction", label: "Floating emoji reaction" },
        { value: "both", label: "Both" },
        { value: "off", label: "Don't show" },
      ],
    },
  ] as const);

  const soundsDir = path.join(ctx.dataPath, "sounds");
  const indexPath = path.join(ctx.dataPath, "sounds.json");

  await fs.mkdir(soundsDir, { recursive: true });

  const sounds: TSound[] = await Bun.file(indexPath)
    .json()
    .catch(() => []);
  const cooldownUntil = new Map<number, number>();

  // admins type these in, so a negative or empty one counts as 0
  const getLimit = (
    key:
      | "maxDurationSeconds"
      | "maxFileSizeKb"
      | "maxSoundsPerUser"
      | "cooldownSeconds",
  ) => Math.max(0, settings.get(key) || 0);

  const getMaxBytes = () => getLimit("maxFileSizeKb") * 1024;

  const getMaxDurationMs = () => getLimit("maxDurationSeconds") * 1000;

  // ids come from the client, so they are only ever looked up, never joined
  // into a path: the stored sound's own id is
  const getSoundPath = (sound: TSound) =>
    path.join(soundsDir, `${sound.id}.ogg`);

  // whatever no sound points to: left by a crash between writing a file and
  // saving the index, or by an older version's format
  const removeOrphanedFiles = async () => {
    const keep = new Set(sounds.map((sound) => path.basename(getSoundPath(sound))));
    const files = await fs.readdir(soundsDir);

    await Promise.all(
      files
        .filter((file) => !keep.has(file))
        .map((file) => fs.rm(path.join(soundsDir, file), { force: true })),
    );
  };

  await removeOrphanedFiles();

  /** The caller's own sound, or throws: for what only its uploader may do. */
  const getOwnSound = (userId: number, soundId: string): TSound => {
    const sound = getSound(soundId);

    if (sound.uploaderId !== userId) {
      throw new Error("You can only change your own sounds.");
    }

    return sound;
  };

  const renameSound = async (sound: TSound, name: unknown) => {
    sound.name = validateName(name);

    await saveSounds();
  };

  const getSound = (soundId: string): TSound => {
    const sound = sounds.find((s) => s.id === soundId);

    if (!sound) throw new Error("That sound no longer exists.");

    return sound;
  };

  const saveSounds = async () => {
    await Bun.write(indexPath, JSON.stringify(sounds));

    ctx.push.toAll({ type: "changed" });
  };

  const removeSound = async (sound: TSound) => {
    sounds.splice(sounds.indexOf(sound), 1);

    await saveSounds();
    await fs.rm(getSoundPath(sound), { force: true });
  };

  ctx.ui.enable();

  ctx.http.post(
    "/sounds",
    async (req, res, { userId }) => {
      if (!userId) return sendJson(res, 401, { error: "Sign in first." });

      const params = new URL(req.url ?? "", "http://localhost").searchParams;
      const maxDurationMs = getMaxDurationMs();
      let name: string;

      try {
        name = validateName(params.get("name"));
      } catch (error) {
        return sendJson(res, 400, { error: getErrorMessage(error) });
      }

      const owned = sounds.filter((s) => s.uploaderId === userId).length;

      if (owned >= getLimit("maxSoundsPerUser")) {
        return sendJson(res, 400, {
          error: "You have reached your sound limit. Delete one first.",
        });
      }

      let data: Uint8Array;
      let durationMs: number;

      try {
        data = await readBody(req, getMaxBytes());
        durationMs = getOggOpusDurationMs(data);
      } catch (error) {
        return sendJson(res, 400, { error: getErrorMessage(error) });
      }

      // a few ms of slack for rounding in the browser's trim
      if (durationMs > maxDurationMs + 50) {
        return sendJson(res, 400, {
          error: `Sounds can be at most ${(maxDurationMs / 1000).toFixed(1)} seconds long.`,
        });
      }

      const sound: TSound = {
        id: randomUUID(),
        name,
        uploaderId: userId,
        durationMs: Math.round(durationMs),
        createdAt: Date.now(),
      };

      await Bun.write(getSoundPath(sound), data);

      sounds.push(sound);

      await saveSounds();

      ctx.logger.log(`User ${userId} uploaded "${name}"`);

      sendJson(res, 201, sound);
    },
    { requires: Permission.UPLOAD_FILES },
  );

  ctx.http.get(
    "/sounds/*",
    async (req, res) => {
      const soundId = new URL(req.url ?? "", "http://localhost").pathname
        .split("/")
        .pop();
      const sound = sounds.find((s) => s.id === soundId);

      if (!sound) return sendJson(res, 404, { error: "Sound not found." });

      res.writeHead(200, {
        "content-type": "audio/ogg",
        "x-content-type-options": "nosniff",
        // an id is never reused, so its file never changes
        "cache-control": "private, max-age=31536000, immutable",
      });
      res.end(await fs.readFile(getSoundPath(sound)));
    },
    { auth: true },
  );

  ctx.actions.register({
    name: "getSoundboard",
    executes: async () => ({
      sounds,
      maxDurationMs: getMaxDurationMs(),
      maxBytes: getMaxBytes(),
      normalizeLoudness: settings.get("normalizeLoudness"),
    }),
  });

  ctx.actions.register({
    name: "playSound",
    executes: async (invoker, { soundId }) => {
      const channelId = invoker.currentVoiceChannelId;

      if (!channelId) throw new Error("Join a voice channel to play sounds.");

      const sound = getSound(soundId);
      const now = Date.now();

      // the client disables its buttons for the cooldown, so this only
      // answers a client that ignores it
      if (now < (cooldownUntil.get(invoker.userId) ?? 0)) {
        throw new Error("Wait a moment before playing another sound.");
      }

      // a sound longer than the cooldown blocks the next one until it ends
      const cooldownMs = Math.max(
        getLimit("cooldownSeconds") * 1000,
        sound.durationMs,
      );

      cooldownUntil.set(invoker.userId, now + cooldownMs);

      const indicator = settings.get("playerIndicator");
      const showReaction = indicator === "reaction" || indicator === "both";

      // every client plays it on its own, so nothing streams through voice
      ctx.push.toVoiceChannel(channelId, {
        type: "play",
        soundId,
        userId: invoker.userId,
        soundName: sound.name,
        durationMs: sound.durationMs,
        showBadge: indicator === "badge" || indicator === "both",
      });

      if (showReaction) {
        // the sound already played, so a reaction that fails is only logged
        await ctx.voice
          .react(channelId, invoker.userId, PLAYER_REACTION_EMOJI)
          .catch((error) =>
            ctx.logger.error("Could not show who played a sound", error),
          );
      }

      return { cooldownMs };
    },
  });

  ctx.actions.register({
    name: "deleteSound",
    description: "Deletes a sound the caller uploaded.",
    executes: async (invoker, { soundId }) =>
      removeSound(getOwnSound(invoker.userId, soundId)),
  });

  ctx.actions.register({
    name: "deleteAnySound",
    description: "Deletes any sound, whoever uploaded it.",
    requires: Permission.MANAGE_PLUGINS,
    executes: async (invoker, { soundId }) => {
      const sound = getSound(soundId);

      await removeSound(sound);

      ctx.logger.log(`User ${invoker.userId} deleted "${sound.name}"`);
    },
  });

  ctx.actions.register({
    name: "renameSound",
    description: "Renames a sound the caller uploaded.",
    executes: async (invoker, { soundId, name }) =>
      renameSound(getOwnSound(invoker.userId, soundId), name),
  });

  ctx.actions.register({
    name: "renameAnySound",
    description: "Renames any sound, whoever uploaded it.",
    requires: Permission.MANAGE_PLUGINS,
    executes: async (invoker, { soundId, name }) =>
      renameSound(getSound(soundId), name),
  });
};

export { onLoad };
