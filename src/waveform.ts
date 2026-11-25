/**
 * The lowest and highest sample in each of `count` equal slices of a clip,
 * channels mixed down, scaled so the loudest point reaches ±1. One slice per
 * pixel column draws the real shape of the sound, not a bar chart of it.
 */
const getWaveformColumns = (channels: Float32Array[], count: number) => {
  const length = channels[0]?.length ?? 0;
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  let loudest = 0;

  for (let column = 0; column < count; column++) {
    const from = Math.floor((column * length) / count);
    // at least one sample, so a clip shorter than the width still draws
    const to = Math.max(from + 1, Math.floor(((column + 1) * length) / count));
    let low = 0;
    let high = 0;

    for (let i = from; i < to && i < length; i++) {
      let sample = 0;

      for (const samples of channels) sample += samples[i]!;

      sample /= channels.length;
      low = Math.min(low, sample);
      high = Math.max(high, sample);
    }

    min[column] = low;
    max[column] = high;
    loudest = Math.max(loudest, -low, high);
  }

  if (loudest > 0) {
    for (let column = 0; column < count; column++) {
      min[column]! /= loudest;
      max[column]! /= loudest;
    }
  }

  return { min, max };
};

export { getWaveformColumns };
