import * as Tone from 'tone';
import { jitter, renderImpact } from './impact';

// --- Playback tuning ------------------------------------------------------

// We render a few knock variants once so hits stay cheap and polyphonic.
const IMPACT_VARIANTS = 4;
const VOICES = 8;
const ENERGY_FLOOR = 0.02; // below this a contact is a roll, not a knock
const PER_COLLIDER_COOLDOWN = 0.07; // seconds before the same wall may knock again
const GLOBAL_COOLDOWN = 0.025; // seconds between impact clusters
const MAX_HITS_PER_FRAME = 3; // layered hits within one cluster, e.g. a corner
const HIT_STAGGER = 0.002;

const ROLL_MAX_SPEED = 8; // surface speed mapping to full rolling loudness
const ROLL_MAX_GAIN = 0.35;
const ROLL_MIN_CUTOFF = 400;
const ROLL_CUTOFF_RANGE = 2600;
const ROLL_RAMP = 0.06;
const VOLUME_RAMP = 0.05;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class GameAudio {
  private masterGain: Tone.Gain;
  private voices: { gain: Tone.Gain; filter: Tone.Filter }[] = [];
  private buffers: Tone.ToneAudioBuffer[] = [];

  private rollNoise: Tone.Noise;
  private rollFilter: Tone.Filter;
  private rollGain: Tone.Gain;

  private started = false;
  private unlocking: Promise<void> | null = null;
  private enabled: boolean;
  private volume: number;

  private rollTarget = -1;
  private rollCutoff = -1;

  private voiceIndex = 0;
  private variantIndex = 0;
  private lastHitAt = new Map<number, number>();
  private lastAnyHitAt = -Infinity;
  private frameHits = 0;

  constructor(volume: number, enabled: boolean) {
    this.volume = volume;
    this.enabled = enabled;

    const limiter = new Tone.Limiter(-3).toDestination();
    this.masterGain = new Tone.Gain(enabled ? volume : 0).connect(limiter);

    for (let i = 0; i < VOICES; i++) {
      const filter = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 0.7 }).connect(this.masterGain);
      this.voices.push({ gain: new Tone.Gain(1).connect(filter), filter });
    }

    const sampleRate = Tone.getContext().sampleRate;
    for (let i = 0; i < IMPACT_VARIANTS; i++) {
      this.buffers.push(Tone.ToneAudioBuffer.fromArray(renderImpact(sampleRate, i, IMPACT_VARIANTS)));
    }

    // Continuous contact bed. Brown noise through a speed-driven lowpass reads
    // as a heavy ball rolling over wood; the highpass keeps it off the subs.
    this.rollGain = new Tone.Gain(0).connect(this.masterGain);
    const rollHighpass = new Tone.Filter({ type: 'highpass', frequency: 120 }).connect(this.rollGain);
    this.rollFilter = new Tone.Filter({ type: 'lowpass', frequency: 400, Q: 1.2 }).connect(rollHighpass);
    this.rollNoise = new Tone.Noise('brown').connect(this.rollFilter);
  }

  // pointerdown and the audio toggle can both fire within one interaction, so
  // the in-flight promise is shared -- starting the noise source twice throws.
  async unlock() {
    if (!this.unlocking) {
      this.unlocking = Tone.start().then(() => {
        this.started = true;
        this.rollNoise.start();
      });
    }
    return this.unlocking;
  }

  setVolume(v: number) {
    this.volume = v;
    this.masterGain.gain.rampTo(this.enabled ? v : 0, VOLUME_RAMP);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.masterGain.gain.rampTo(on ? this.volume : 0, VOLUME_RAMP);
  }

  /** Call once per frame, before draining collision events. */
  beginFrame() {
    this.frameHits = 0;
  }

  impact(energy: number, colliderHandle: number) {
    if (!this.started || !this.enabled || energy < ENERGY_FLOOR) return;
    if (this.frameHits >= MAX_HITS_PER_FRAME) return;

    const now = Tone.now();

    // The global cooldown gates the *first* hit of a frame only. Hits within
    // the same frame are one physical event -- a ball landing in a corner
    // touches several walls at once -- so they layer instead of blocking.
    if (this.frameHits === 0 && now - this.lastAnyHitAt < GLOBAL_COOLDOWN) return;

    const lastHit = this.lastHitAt.get(colliderHandle);
    if (lastHit !== undefined && now - lastHit < PER_COLLIDER_COOLDOWN) return;

    this.lastHitAt.set(colliderHandle, now);
    this.lastAnyHitAt = now;

    const voice = this.voices[this.voiceIndex];
    this.voiceIndex = (this.voiceIndex + 1) % VOICES;
    const buffer = this.buffers[this.variantIndex];
    this.variantIndex = (this.variantIndex + 1) % IMPACT_VARIANTS;

    // Stagger hits within a frame so no two share a start time.
    const startTime = now + HIT_STAGGER * this.frameHits;

    // Harder hits are louder and brighter; soft taps are dull thuds.
    voice.filter.frequency.setValueAtTime(800 + 6000 * energy, startTime);
    voice.gain.gain.setValueAtTime(0.15 + 0.85 * Math.pow(energy, 0.7), startTime);

    const source = new Tone.ToneBufferSource({
      url: buffer,
      playbackRate: jitter(0.06),
      onended: () => source.dispose()
    }).connect(voice.gain);

    source.start(startTime);
    this.frameHits++;
  }

  updateRolling(surfaceSpeed: number, inContact: boolean) {
    if (!this.started) return;

    const t = clamp01(surfaceSpeed / ROLL_MAX_SPEED);
    const gain = inContact ? ROLL_MAX_GAIN * Math.pow(t, 1.5) : 0;
    const cutoff = ROLL_MIN_CUTOFF + ROLL_CUTOFF_RANGE * t;

    // Called every frame, so only schedule automation on a real change --
    // otherwise we queue 120 redundant ramps a second.
    if (Math.abs(gain - this.rollTarget) > 0.002) {
      this.rollTarget = gain;
      this.rollGain.gain.rampTo(gain, ROLL_RAMP);
    }
    if (Math.abs(cutoff - this.rollCutoff) > 20) {
      this.rollCutoff = cutoff;
      this.rollFilter.frequency.rampTo(cutoff, 0.08);
    }
  }

  suspendRolling() {
    if (!this.started) return;
    this.rollTarget = 0;
    this.rollGain.gain.rampTo(0, ROLL_RAMP);
  }
}
