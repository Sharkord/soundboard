import { expect, test } from "bun:test";
import { getWaveformColumns } from "./waveform";

test("each column spans its slice, mixed down and scaled to the loudest", () => {
  const left = Float32Array.from([0.5, -0.25, 0, 0]);
  const right = Float32Array.from([0.5, -0.25, 0.1, -0.1]);
  const { min, max } = getWaveformColumns([left, right], 2);

  // mixed: [0.5, -0.25, 0.05, -0.05], loudest 0.5
  expect([...min]).toEqual([-0.5, -0.10000000149011612]);
  expect([...max]).toEqual([1, 0.10000000149011612]);
});

test("silence stays flat, and a clip shorter than the width stretches across it", () => {
  expect([...getWaveformColumns([new Float32Array(3)], 2).max]).toEqual([0, 0]);
  expect([...getWaveformColumns([Float32Array.from([1])], 3).max]).toEqual([
    1, 1, 1,
  ]);
});
