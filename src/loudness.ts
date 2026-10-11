// every clip is brought to about the same loudness on upload, so no sound is
// drowned out or deafening next to the others
const TARGET_RMS = 0.1; // -20dBFS
// headroom, so a boosted peak never clips
const MAX_PEAK = 0.98;
// a near silent clip would otherwise be boosted into a wall of hiss
const MAX_GAIN = 10;

/**
 * The gain that brings `samples` to the target loudness without clipping.
 *
 * ponytail: plain RMS, not perceived loudness (LUFS). Add K-weighting if
 * bass-heavy clips still sound louder than the rest.
 */
const getNormalizationGain = (samples: Float32Array) => {
  let sumOfSquares = 0;
  let peak = 0;

  for (const sample of samples) {
    sumOfSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  if (peak === 0) return 1;

  const rms = Math.sqrt(sumOfSquares / samples.length);

  return Math.min(TARGET_RMS / rms, MAX_PEAK / peak, MAX_GAIN);
};

export { getNormalizationGain };
