import { actions } from "@sharkord/plugin-sdk/client";
import { Button, Input, Label, Slider } from "@sharkord/ui";
import { Pause, Play, Upload } from "lucide-react";
import { memo, useCallback, useMemo, useRef, useState } from "react";
import { MAX_NAME_LENGTH } from "../contract";
import { MAX_CHANNELS } from "../ogg";
import { getNormalizationGain } from "../loudness";
import { encodeOpus, getAudioContext, playBuffer } from "./audio";
import {
  PLUGIN_ID,
  formatDuration,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";

const WAVEFORM_BARS = 120;

/**
 * The part of the clip between `startMs` and `endMs`, one array per channel.
 * Mono and stereo are kept as they are; anything wider keeps its first two
 * channels, which are left and right.
 *
 * ponytail: drops the rest of a surround file rather than mixing it in. Mix
 * centre and surrounds into left and right if 5.1 uploads ever show up.
 */
const sliceChannels = (
  buffer: AudioBuffer,
  startMs: number,
  endMs: number,
): Float32Array[] => {
  const from = Math.floor((startMs / 1000) * buffer.sampleRate);
  const to = Math.min(
    buffer.length,
    Math.floor((endMs / 1000) * buffer.sampleRate),
  );

  return Array.from(
    { length: Math.min(buffer.numberOfChannels, MAX_CHANNELS) },
    (_, channel) => buffer.getChannelData(channel).slice(from, to),
  );
};

/** The loudest sample of any channel in each of `count` equal buckets, 0..1. */
const getPeaks = (channels: Float32Array[], count: number) => {
  const length = channels[0]?.length ?? 0;
  const size = Math.max(1, Math.floor(length / count));
  const peaks = Array.from({ length: count }, (_, bar) => {
    let peak = 0;

    for (const samples of channels) {
      for (let i = bar * size; i < (bar + 1) * size && i < length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]!));
      }
    }

    return peak;
  });
  const loudest = Math.max(...peaks) || 1;

  return peaks.map((peak) => peak / loudest);
};

type TWaveformProps = {
  peaks: number[];
  /** the selected part, as fractions of the whole clip */
  from: number;
  to: number;
};

const Waveform = memo(({ peaks, from, to }: TWaveformProps) => (
  <div style={{ display: "flex", gap: 1, alignItems: "center", height: 56 }}>
    {peaks.map((peak, bar) => {
      const position = bar / peaks.length;
      const selected = position >= from && position <= to;

      return (
        <div
          key={bar}
          style={{
            flex: 1,
            height: `${Math.max(4, peak * 100)}%`,
            borderRadius: 1,
            background: selected ? "var(--primary)" : "var(--muted)",
          }}
        />
      );
    })}
  </div>
));

const UploadForm = memo(({ onUploaded }: { onUploaded?: () => void }) => {
  const { maxDurationMs: maxMs, maxBytes, normalizeLoudness } = useSoundboard();
  const { error, setError, run } = useErrorState();
  const playbackOptions = usePlaybackOptions();
  const [buffer, setBuffer] = useState<AudioBuffer>();
  const [range, setRange] = useState<[number, number]>([0, 0]);
  const [name, setName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  // a new key clears the file input after an upload
  const [fileInputKey, setFileInputKey] = useState(0);
  const previewRef = useRef<AudioBufferSourceNode>(undefined);

  const durationMs = buffer ? Math.floor(buffer.duration * 1000) : 0;

  const peaks = useMemo(
    () =>
      buffer
        ? getPeaks(sliceChannels(buffer, 0, durationMs), WAVEFORM_BARS)
        : [],
    [buffer, durationMs],
  );

  const stopPreview = useCallback(() => {
    previewRef.current?.stop();
    previewRef.current = undefined;
    setIsPreviewing(false);
  }, []);

  const onFileChange = async (file: File | undefined) => {
    stopPreview();
    setBuffer(undefined);
    setError("");

    if (!file) return;

    try {
      const decoded = await getAudioContext().decodeAudioData(
        await file.arrayBuffer(),
      );

      setBuffer(decoded);
      setRange([0, Math.min(Math.floor(decoded.duration * 1000), maxMs)]);
      setName(file.name.replace(/\.[^.]+$/, "").slice(0, MAX_NAME_LENGTH));
    } catch {
      setError("That file is not audio this browser can read.");
    }
  };

  // dragging past the limit drags the other end along, so the selection is
  // never longer than the server accepts
  const onRangeChange = ([start = 0, end = 0]: number[]) => {
    stopPreview();

    if (end - start <= maxMs) return setRange([start, end]);

    setRange(start !== range[0] ? [start, start + maxMs] : [end - maxMs, end]);
  };

  // the same for the preview and the upload, so what you hear is what is kept
  const getGain = (channels: Float32Array[]) =>
    normalizeLoudness ? getNormalizationGain(channels) : 1;

  const togglePreview = async () => {
    if (!buffer) return;

    if (previewRef.current) return stopPreview();

    // at the loudness it will be stored at, so the preview is honest
    const gain = getGain(sliceChannels(buffer, range[0], range[1]));
    const source = await playBuffer(buffer, {
      ...playbackOptions,
      volume: playbackOptions.volume * gain,
      startMs: range[0],
      endMs: range[1],
    });

    source.onended = () => {
      if (previewRef.current === source) stopPreview();
    };

    previewRef.current = source;
    setIsPreviewing(true);
  };

  const upload = () =>
    run(async () => {
      if (!buffer) return;

      stopPreview();
      setIsUploading(true);

      try {
        const channels = sliceChannels(buffer, range[0], range[1]);
        const gain = getGain(channels);

        for (const samples of channels) {
          samples.forEach((sample, i) => (samples[i] = sample * gain));
        }

        const file = await encodeOpus(channels);

        // checked here so a too large clip never leaves the browser
        if (file.size > maxBytes) {
          throw new Error(
            `This clip is ${Math.ceil(file.size / 1024)}KB, over the ${Math.floor(maxBytes / 1024)}KB limit. Trim it shorter.`,
          );
        }

        const res = await actions.fetchPluginRoute(
          PLUGIN_ID,
          `/sounds?${new URLSearchParams({ name })}`,
          {
            method: "POST",
            headers: { "content-type": "audio/ogg" },
            body: file,
          },
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));

          throw new Error(body.error ?? "The upload failed.");
        }

        setBuffer(undefined);
        setName("");
        setFileInputKey((key) => key + 1);
        onUploaded?.();
      } finally {
        setIsUploading(false);
      }
    });

  return (
    <Stack>
      <Input
        key={fileInputKey}
        type="file"
        accept="audio/*"
        disabled={!maxMs}
        onChange={(event) => onFileChange(event.target.files?.[0])}
      />

      {buffer && (
        <>
          <Stack gap={6}>
            <Label>
              Trim · {formatDuration(range[1] - range[0])} of at most{" "}
              {formatDuration(maxMs)}
            </Label>
            <Waveform
              peaks={peaks}
              from={range[0] / durationMs}
              to={range[1] / durationMs}
            />
            <Slider
              min={0}
              max={durationMs}
              step={10}
              minStepsBetweenThumbs={10}
              value={range}
              onValueChange={onRangeChange}
            />
            <MutedText>
              {formatDuration(range[0])} to {formatDuration(range[1])}
            </MutedText>
          </Stack>

          <Stack gap={6}>
            <Label>Name</Label>
            <Input
              value={name}
              maxLength={MAX_NAME_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </Stack>

          <Row>
            <Button variant="secondary" onClick={togglePreview}>
              {isPreviewing ? <Pause /> : <Play />}
              Preview
            </Button>
            <Button onClick={upload} disabled={isUploading || !name.trim()}>
              <Upload />
              {isUploading ? "Uploading..." : "Upload"}
            </Button>
          </Row>
        </>
      )}

      <ErrorText error={error} />
    </Stack>
  );
});

export { UploadForm };
