// --- Wood knock synthesis -------------------------------------------------
// A metal ball striking a wooden panel is a noise transient exciting a set of
// heavily damped, inharmonic wood modes, plus a very short bright ping from the
// steel itself. Pure DSP, no audio graph: renders straight into a Float32Array.

export const IMPACT_DURATION = 0.3;

// Inharmonic partial ratios of a struck wooden panel, with amplitudes and
// decay times. Wood is lossy: high partials die within milliseconds.
const WOOD_RATIOS = [1.0, 2.14, 3.72, 6.31, 9.4];
const WOOD_AMPS = [1.0, 0.62, 0.4, 0.22, 0.1];
const WOOD_DECAYS = [0.085, 0.055, 0.032, 0.018, 0.01];

// The steel ball's own contact ring: bright, gone almost immediately.
const METAL_PARTIALS = [
  { freq: 3300, decay: 0.006, amp: 0.1 },
  { freq: 5200, decay: 0.0035, amp: 0.06 }
];

// Amplitude of the excitation burst relative to the modes. Wood knocks are
// noise-forward: this is what puts the transient peak in the first millisecond
// instead of letting the modes sum into a soft, tonal onset.
const NOISE_AMP = 1.6;

// The modes are still ringing when the buffer ends, so fade the last stretch
// out; without it every hit ends on a step discontinuity, i.e. a click.
const FADE_OUT = 0.06;

const F0_MIN = 195;
const F0_RANGE = 55;

export const jitter = (amount: number) => 1 + (Math.random() * 2 - 1) * amount;

/**
 * Renders one knock variant. `variant` / `variantCount` stratify the base
 * frequency across the bank so two variants can never land on top of each
 * other — repeated hits stay audibly distinct.
 */
export function renderImpact(sampleRate: number, variant = 0, variantCount = 1): Float32Array {
  const length = Math.floor(sampleRate * IMPACT_DURATION);
  const data = new Float32Array(length);

  const slice = F0_RANGE / variantCount;
  const f0 = F0_MIN + slice * (variant + Math.random());
  const modes = WOOD_RATIOS.map((ratio, i) => ({
    freq: f0 * ratio * jitter(0.05),
    amp: WOOD_AMPS[i],
    decay: WOOD_DECAYS[i] * jitter(0.15)
  })).concat(METAL_PARTIALS.map(p => ({ ...p, freq: p.freq * jitter(0.05) })));

  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    let sample = 0;

    // Modes start at phase 0, so the attack is instantaneous with no DC step.
    for (const mode of modes) {
      sample += mode.amp * Math.exp(-t / mode.decay) * Math.sin(2 * Math.PI * mode.freq * t);
    }

    // Excitation burst. Fade in over 0.4ms so the noise itself does not click.
    const fadeIn = Math.min(t / 0.0004, 1);
    const window = 0.5 * (1 - Math.cos(Math.PI * fadeIn));
    sample += NOISE_AMP * window * Math.exp(-t / 0.0025) * (Math.random() * 2 - 1);

    // Raised-cosine fade to silence at the buffer boundary.
    const remaining = IMPACT_DURATION - t;
    if (remaining < FADE_OUT) {
      sample *= 0.5 * (1 - Math.cos(Math.PI * (remaining / FADE_OUT)));
    }

    data[n] = sample;
  }

  let peak = 0;
  for (let n = 0; n < length; n++) peak = Math.max(peak, Math.abs(data[n]));
  if (peak > 0) {
    const scale = 0.95 / peak;
    for (let n = 0; n < length; n++) data[n] *= scale;
  }

  return data;
}
