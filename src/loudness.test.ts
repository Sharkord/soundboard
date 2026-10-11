import { expect, test } from "bun:test";
import { getNormalizationGain } from "./loudness";

const sine = (amplitude: number) =>
  Float32Array.from({ length: 4800 }, (_, i) => Math.sin(i / 10) * amplitude);

test("quiet and loud clips meet at the same loudness", () => {
  // a sine's RMS is its amplitude over √2, so both land on 0.1
  expect(getNormalizationGain(sine(0.05))).toBeCloseTo(0.1 * Math.SQRT2 / 0.05, 2);
  expect(getNormalizationGain(sine(0.9))).toBeCloseTo(0.1 * Math.SQRT2 / 0.9, 2);
});

test("a boost never clips, never runs away, and silence is left alone", () => {
  const spiky = new Float32Array(4800).fill(0.001);

  spiky[0] = 0.5;

  expect(getNormalizationGain(spiky)).toBeCloseTo(0.98 / 0.5);
  expect(getNormalizationGain(new Float32Array(4800).fill(0.0001))).toBe(10);
  expect(getNormalizationGain(new Float32Array(4800))).toBe(1);
});
