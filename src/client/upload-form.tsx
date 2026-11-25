import { actions } from "@sharkord/plugin-sdk/client";
import {
  Button,
  IconButton,
  Group,
  Input,
  Slider,
  Stepper,
} from "@sharkord/ui";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Upload,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_NAME_LENGTH } from "../contract";
import { MAX_CHANNELS } from "../ogg";
import { getNormalizationGain } from "../loudness";
import { getWaveformColumns } from "../waveform";
import { decodeAudio, encodeOpus, getAudioContext, playBuffer } from "./audio";
import { CategorySelect } from "./categories";
import {
  PLUGIN_ID,
  formatDuration,
  useErrorState,
  usePlaybackOptions,
  useSoundboard,
} from "./store";
import { ErrorText, MutedText, Row, Stack } from "./ui";


/**
 * The part of the clip between `startMs` and `endMs`, one array per channel.
 * Views into the buffer, not copies: never write to them.
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
    (_, channel) => buffer.getChannelData(channel).subarray(from, to),
  );
};

const WAVEFORM_HEIGHT = 64;

type TPreviewPlayback = {
  /** on the audio context's clock, which is what the sound plays to */
  startedAt: number;
  fromMs: number;
};

type TWaveformProps = {
  buffer: AudioBuffer;
  durationMs: number;
  /** the selected part, in ms of the whole clip */
  range: [number, number];
  /** the preview playing, to follow with a playhead */
  playback: TPreviewPlayback | undefined;
};

const Waveform = memo(
  ({ buffer, durationMs, range, playback }: TWaveformProps) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const playheadRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
      const canvas = canvasRef.current;

      if (!canvas) return;

      const observer = new ResizeObserver(([entry]) =>
        setWidth(Math.round(entry?.contentRect.width ?? 0)),
      );

      observer.observe(canvas);

      return () => observer.disconnect();
    }, []);

    // sharp on high density screens: one column per device pixel
    const pixelRatio = window.devicePixelRatio || 1;
    const columnCount = Math.round(width * pixelRatio);

    // the whole file is read once per width, not once per drag of the trim
    const columns = useMemo(
      () =>
        columnCount > 0
          ? getWaveformColumns(
              sliceChannels(buffer, 0, durationMs),
              columnCount,
            )
          : undefined,
      [buffer, durationMs, columnCount],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");

      if (!canvas || !context || !columns) return;

      const height = WAVEFORM_HEIGHT * pixelRatio;
      const middle = height / 2;
      const style = getComputedStyle(canvas);
      const selected = style.getPropertyValue("--primary").trim();
      const unselected = style.getPropertyValue("--muted-foreground").trim();
      const from = (range[0] / durationMs) * columnCount;
      const to = (range[1] / durationMs) * columnCount;

      canvas.width = columnCount;
      canvas.height = height;

      // one pass per colour, so the style is set twice, not per column
      const drawColumns = (
        fromColumn: number,
        toColumn: number,
        color: string,
        alpha: number,
      ) => {
        context.globalAlpha = alpha;
        context.fillStyle = color;

        for (let x = Math.max(0, fromColumn); x < toColumn; x++) {
          const top = middle - columns.max[x]! * middle;
          const bottom = middle - columns.min[x]! * middle;

          // never thinner than a line, so silence still shows where it is
          context.fillRect(x, top, 1, Math.max(pixelRatio, bottom - top));
        }
      };

      drawColumns(0, Math.ceil(from), unselected, 0.35);
      drawColumns(Math.floor(to) + 1, columnCount, unselected, 0.35);
      drawColumns(Math.ceil(from), Math.floor(to) + 1, selected, 1);
    }, [columns, columnCount, range, durationMs, pixelRatio]);

    // moved every frame without rendering: React would be far too slow here
    useEffect(() => {
      const playhead = playheadRef.current;

      if (!playhead || !playback) return;

      const audioContext = getAudioContext();
      let frame = 0;

      // a transform, not `left`: moved by the compositor, with no layout
      const move = () => {
        const ms =
          playback.fromMs +
          (audioContext.currentTime - playback.startedAt) * 1000;

        playhead.style.transform = `translateX(${(Math.min(ms, durationMs) / durationMs) * width}px)`;
        frame = requestAnimationFrame(move);
      };

      move();

      return () => cancelAnimationFrame(frame);
    }, [playback, durationMs, width]);

    return (
      <div style={{ position: "relative", height: WAVEFORM_HEIGHT }}>
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
        {playback && (
          <div
            ref={playheadRef}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: -1,
              width: 2,
              willChange: "transform",
              borderRadius: 1,
              background: "var(--foreground)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
    );
  },
);

type TDraft = {
  /** the file input's order, unique within one pick */
  id: number;
  buffer: AudioBuffer;
  durationMs: number;
  range: [number, number];
  name: string;
  categoryId: string | undefined;
};

const UploadForm = memo(({ onUploaded }: { onUploaded?: () => void }) => {
  const {
    maxDurationMs: maxMs,
    maxBytes,
    normalizeLoudness,
    categories,
  } = useSoundboard();
  const { error, setError, run } = useErrorState();
  const playbackOptions = usePlaybackOptions();
  // one per picked file not uploaded yet, each trimmed and named on its own
  const [drafts, setDrafts] = useState<TDraft[]>([]);
  const [step, setStep] = useState(0);
  // the last category picked, for every file after it: a batch tends to
  // share one, and it is kept after an upload too
  const [lastCategoryId, setLastCategoryId] = useState<string>();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<TPreviewPlayback>();
  // a new key clears the file input once everything is uploaded
  const [fileInputKey, setFileInputKey] = useState(0);
  const previewRef = useRef<AudioBufferSourceNode>(undefined);

  // an upload removes its draft, so the step can point one past the end
  const currentIndex = Math.min(step, drafts.length - 1);
  const current = drafts[currentIndex];

  const stopPreview = useCallback(() => {
    previewRef.current?.stop();
    previewRef.current = undefined;
    setPreview(undefined);
  }, []);

  const updateCurrent = (changes: Partial<TDraft>) =>
    setDrafts((list) =>
      list.map((draft) =>
        draft.id === current?.id ? { ...draft, ...changes } : draft,
      ),
    );

  const removeDraft = (id: number) =>
    setDrafts((list) => {
      const next = list.filter((draft) => draft.id !== id);

      if (next.length === 0) setFileInputKey((key) => key + 1);

      return next;
    });

  const goTo = (index: number) => {
    stopPreview();
    setStep(index);
  };

  const onFilesChange = async (files: File[]) => {
    stopPreview();
    setDrafts([]);
    setStep(0);
    setError("");

    // all at once: the browser decodes off the main thread
    const results = await Promise.allSettled(
      files.map(async (file) => decodeAudio(await file.arrayBuffer())),
    );
    const unreadable: string[] = [];
    const decoded: TDraft[] = [];

    results.forEach((result, id) => {
      const file = files[id]!;

      if (result.status === "rejected") return unreadable.push(file.name);

      const buffer = result.value;
      const durationMs = Math.floor(buffer.duration * 1000);

      decoded.push({
        id,
        buffer,
        durationMs,
        range: [0, Math.min(durationMs, maxMs)],
        name: file.name.replace(/\.[^.]+$/, "").slice(0, MAX_NAME_LENGTH),
        categoryId: lastCategoryId,
      });
    });

    setDrafts(decoded);

    if (unreadable.length > 0) {
      setError(
        `Not audio this browser can read, so left out: ${unreadable.join(", ")}`,
      );
    }
  };

  // dragging past the limit drags the other end along, so the selection is
  // never longer than the server accepts
  const onRangeChange = ([start = 0, end = 0]: number[]) => {
    if (!current) return;

    stopPreview();

    if (end - start <= maxMs) return updateCurrent({ range: [start, end] });

    updateCurrent({
      range:
        start !== current.range[0]
          ? [start, start + maxMs]
          : [end - maxMs, end],
    });
  };

  // the same for the preview and the upload, so what you hear is what is kept
  const getGain = (channels: Float32Array[]) =>
    normalizeLoudness ? getNormalizationGain(channels) : 1;

  const togglePreview = async () => {
    if (!current) return;

    if (previewRef.current) return stopPreview();

    const { buffer, range } = current;
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
    setPreview({
      startedAt: getAudioContext().currentTime,
      fromMs: range[0],
    });
  };

  /** Encodes and uploads one draft, or throws why the server refused it. */
  const uploadDraft = async ({ buffer, range, name, categoryId }: TDraft) => {
    const channels = sliceChannels(buffer, range[0], range[1]);
    const file = await encodeOpus(channels, getGain(channels));

    // checked here so a too large clip never leaves the browser
    if (file.size > maxBytes) {
      throw new Error(
        `"${name}" is ${Math.ceil(file.size / 1024)}KB, over the ${Math.floor(maxBytes / 1024)}KB limit. Trim it shorter.`,
      );
    }

    const res = await actions.fetchPluginRoute(
      PLUGIN_ID,
      `/sounds?${new URLSearchParams({ name, categoryId: categoryId ?? "" })}`,
      {
        method: "POST",
        headers: { "content-type": "audio/ogg" },
        body: file,
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));

      throw new Error(body.error ?? `"${name}" failed to upload.`);
    }
  };

  // in order, stopping at the first failure with its step shown, so it can
  // be fixed and the rest uploaded after it
  const upload = (toUpload: TDraft[]) =>
    run(async () => {
      stopPreview();
      setIsUploading(true);

      // all of them go from the front, so the one uploading is always shown
      if (toUpload.length > 1) setStep(0);

      try {
        for (const draft of toUpload) {
          await uploadDraft(draft);

          removeDraft(draft.id);
        }

        if (toUpload.length === drafts.length) onUploaded?.();
      } finally {
        setIsUploading(false);
      }
    });

  const canUpload = (draft: TDraft) => !isUploading && !!draft.name.trim();

  return (
    <Stack>
      <Input
        key={fileInputKey}
        type="file"
        accept="audio/*"
        multiple
        disabled={!maxMs || isUploading}
        onChange={(event) =>
          onFilesChange([...(event.target.files ?? [])])
        }
      />

      {drafts.length > 1 && (
        <Row>
          {/* scrolls sideways once a big batch outgrows the width */}
          <div style={{ flex: 1, minWidth: 0, overflowX: "auto" }}>
            <Stepper
              current={currentIndex}
              // the stepper only opens earlier steps; Next goes forward
              onStepClick={isUploading ? undefined : goTo}
              steps={drafts.map((draft) => ({
                label: (
                  <span
                    title={draft.name}
                    style={{
                      display: "block",
                      maxWidth: 96,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {draft.name || "Untitled"}
                  </span>
                ),
              }))}
            />
          </div>
          <IconButton
            icon={ChevronLeft}
            size="sm"
            variant="ghost"
            title="Previous file"
            disabled={isUploading || currentIndex === 0}
            onClick={() => goTo(currentIndex - 1)}
          />
          <IconButton
            icon={ChevronRight}
            size="sm"
            variant="ghost"
            title="Next file"
            disabled={isUploading || currentIndex === drafts.length - 1}
            onClick={() => goTo(currentIndex + 1)}
          />
        </Row>
      )}

      {current && (
        <>
          <Group
            label={`Trim · ${formatDuration(current.range[1] - current.range[0])} of at most ${formatDuration(maxMs)}`}
          >
            <Waveform
              buffer={current.buffer}
              durationMs={current.durationMs}
              range={current.range}
              playback={preview}
            />
            <Slider
              // a fresh slider per file, not one sliding between them
              key={current.id}
              min={0}
              max={current.durationMs}
              step={10}
              minStepsBetweenThumbs={10}
              value={current.range}
              onValueChange={onRangeChange}
            />
            <MutedText>
              {formatDuration(current.range[0])} to{" "}
              {formatDuration(current.range[1])}
            </MutedText>
          </Group>

          <Row style={{ alignItems: "end" }}>
            <Group label="Name" className="flex-1">
              <Input
                value={current.name}
                maxLength={MAX_NAME_LENGTH}
                onChange={(event) => updateCurrent({ name: event.target.value })}
              />
            </Group>
            {categories.length > 0 && (
              <Group label="Category">
                <CategorySelect
                  categories={categories}
                  value={current.categoryId}
                  onChange={(categoryId) => {
                    setLastCategoryId(categoryId);
                    updateCurrent({ categoryId });
                  }}
                />
              </Group>
            )}
          </Row>

          <Row style={{ flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={togglePreview}>
              {preview ? <Pause /> : <Play />}
              Preview
            </Button>
            {drafts.length > 1 && (
              <Button
                variant="ghost"
                disabled={isUploading}
                onClick={() => {
                  stopPreview();
                  removeDraft(current.id);
                }}
              >
                <X />
                Skip
              </Button>
            )}
            <div style={{ flex: 1 }} />
            <Button
              variant={drafts.length > 1 ? "secondary" : "default"}
              onClick={() => upload([current])}
              disabled={!canUpload(current)}
            >
              <Upload />
              {drafts.length > 1 ? "Upload this one" : "Upload"}
            </Button>
            {drafts.length > 1 && (
              <Button
                onClick={() => upload(drafts)}
                disabled={!drafts.every(canUpload)}
              >
                <Upload />
                Upload all {drafts.length}
              </Button>
            )}
          </Row>

          {isUploading && <MutedText>Uploading...</MutedText>}
        </>
      )}

      <ErrorText error={error} />
    </Stack>
  );
});

export { UploadForm };
