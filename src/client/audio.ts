import { actions } from "@sharkord/plugin-sdk/client";
import { FRAME_DURATION_US, SAMPLE_RATE, muxOggOpus } from "../ogg";
import { PLUGIN_ID } from "./store";

// everything plays through one context, not through <audio> elements: a
// detached element can have its play() aborted by the browser, a buffer source
// cannot. 48kHz so decoding an upload resamples to what the server expects.
let audioContext: AudioContext | undefined;
let currentDeviceId: string | undefined;

const getAudioContext = () =>
  (audioContext ??= new AudioContext({ sampleRate: SAMPLE_RATE }));

// missing from TypeScript's DOM types, and from some browsers
type TRoutableAudioContext = AudioContext & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

const setOutputDevice = async (deviceId = "") => {
  const context: TRoutableAudioContext = getAudioContext();

  // where a context cannot be routed, the default output beats silence
  if (deviceId === (currentDeviceId ?? "") || !context.setSinkId) return;

  await context.setSinkId(deviceId).catch(() => {});
  currentDeviceId = deviceId;
};

type TPlayOptions = {
  volume?: number;
  deviceId?: string;
  startMs?: number;
  endMs?: number;
};

/** Plays `buffer` and returns its source, for stopping or `onended`. */
const playBuffer = async (
  buffer: AudioBuffer,
  { volume = 1, deviceId, startMs = 0, endMs }: TPlayOptions = {},
) => {
  const context = getAudioContext();

  await setOutputDevice(deviceId);
  // a context made outside a click starts suspended
  await context.resume();

  const gain = context.createGain();
  const source = context.createBufferSource();

  gain.gain.value = volume;
  gain.connect(context.destination);
  source.buffer = buffer;
  source.connect(gain);
  source.start(
    0,
    startMs / 1000,
    endMs === undefined ? undefined : (endMs - startMs) / 1000,
  );

  return source;
};

// fetched and decoded once per sound, since a sound never changes
const soundBuffers = new Map<string, Promise<AudioBuffer>>();

const getSoundBuffer = (soundId: string): Promise<AudioBuffer> => {
  let buffer = soundBuffers.get(soundId);

  if (!buffer) {
    buffer = actions
      .fetchPluginRoute(PLUGIN_ID, `/sounds/${soundId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load the sound.");

        return getAudioContext().decodeAudioData(await res.arrayBuffer());
      });

    // a failed fetch is retried on the next play instead of cached
    buffer.catch(() => soundBuffers.delete(soundId));
    soundBuffers.set(soundId, buffer);
  }

  return buffer;
};

// plenty for short clips: about 10KB per second in mono, 13KB in stereo
const OPUS_BITRATES = [64000, 96000];

/**
 * Encodes a 48kHz clip, one array per channel (mono or stereo), into the Ogg
 * Opus file the server stores.
 */
const encodeOpus = async (channels: Float32Array[]): Promise<Blob> => {
  if (typeof AudioEncoder === "undefined") {
    throw new Error("This browser cannot encode audio. Try a recent one.");
  }

  const packets: Uint8Array[] = [];
  const encoder = new AudioEncoder({
    output: (chunk) => {
      const packet = new Uint8Array(chunk.byteLength);

      chunk.copyTo(packet);
      packets.push(packet);
    },
    // flush() rejects with the same error, which is where it surfaces
    error: () => {},
  });

  encoder.configure({
    codec: "opus",
    sampleRate: SAMPLE_RATE,
    numberOfChannels: channels.length,
    bitrate: OPUS_BITRATES[channels.length - 1],
    opus: { frameDuration: FRAME_DURATION_US },
  });
  const frameCount = channels[0]?.length ?? 0;
  // planar: every channel's samples one after the other, not interleaved
  const planes = new Float32Array(frameCount * channels.length);

  channels.forEach((samples, i) => planes.set(samples, i * frameCount));

  encoder.encode(
    new AudioData({
      format: "f32-planar",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: channels.length,
      numberOfFrames: frameCount,
      timestamp: 0,
      data: planes,
    }),
  );

  try {
    await encoder.flush();
  } finally {
    encoder.close();
  }

  return muxOggOpus(packets, frameCount, channels.length);
};

const playSound = async (soundId: string, options?: TPlayOptions) =>
  playBuffer(await getSoundBuffer(soundId), options);

export { encodeOpus, getAudioContext, playBuffer, playSound };
