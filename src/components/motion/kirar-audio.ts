/**
 * Plays the five real Kirar string recordings with Web Audio.
 * Loaded on demand (dynamic import) only after the visitor turns Sound on.
 *
 *   voice ─► string trim ─► dry bus ─┬──────────────────► master ─► safety limiter ─► out
 *                                    └─► room send ─► convolver ┘
 *
 * - Samples (public/audio/kirar) are fetched and decoded once, after the
 *   first Sound on. Opus first, MP3 only if the browser cannot decode Opus.
 * - One voice per string, like the instrument: plucking a string again
 *   damps its previous vibration in ~20 ms and starts the new one at once.
 *   Different strings ring together.
 * - Pluck strength sets level and brightness (soft plucks are slightly darker).
 * - The limiter only engages when fast sweeps stack; single plucks pass
 *   untouched, transient intact.
 * - One synthetic small-room impulse is shared by all strings (no library,
 *   generated in a few ms). The dry signal stays dominant; Room can be off.
 */
import manifest from "./kirar-audio-manifest.json";

const SOURCE_FORMATS = ["webm", "mp3"] as const;
const ASSET_PATH = "/audio/kirar";
const MASTER_GAIN = 0.72;
const ROOM_SEND = 0.16;
const MAX_VOICES = 12;
const CHOKE_SECONDS = 0.02; // time constant when a string is re-plucked
const DAMP_SECONDS = 0.035; // time constant when a finger stops a string
const PRE_ATTACK = 0.003; // start this long before the detected attack

interface Voice {
  string: number;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startsAt: number;
  released: boolean;
}

export interface StrikeLog {
  id: number;
  string: number;
  file: string;
  strength: number;
  scheduledAt: number;
  requestedAt: number;
}

function dbToGain(db: number) {
  return Math.pow(10, db / 20);
}

/** Velocity curve: soft plucks around −12 dB, full pluck at unity. */
export function velocityGain(strength: number) {
  const s = Math.min(1, Math.max(0, strength));
  return 0.22 + 0.78 * Math.pow(s, 1.35);
}

/** Soft plucks lose a little top end, as a gently plucked string does. */
export function velocityCutoff(strength: number) {
  const s = Math.min(1, Math.max(0, strength));
  return Math.min(20000, 3200 * Math.pow(2, s * 2.7));
}

/** First sample of the attack, so playback starts on the pluck, not before it. */
export function findAttack(channel: Float32Array, sampleRate: number): number {
  let peak = 0;
  const limit = Math.min(channel.length, Math.floor(sampleRate * 0.25));
  for (let i = 0; i < limit; i++) peak = Math.max(peak, Math.abs(channel[i]));
  const threshold = peak * 0.05;
  for (let i = 0; i < limit; i++) {
    if (Math.abs(channel[i]) > threshold) return Math.max(0, i / sampleRate - PRE_ATTACK);
  }
  return 0;
}

/** A small, warm room: sparse early reflections, then a damped noise tail. */
function createRoomImpulse(context: BaseAudioContext): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.floor(rate * 1.1);
  const impulse = context.createBuffer(2, length, rate);
  const tau = 0.85 / 6.91; // RT60 ≈ 0.85 s
  const early = [0.011, 0.017, 0.023, 0.031, 0.038];
  for (let c = 0; c < 2; c++) {
    const data = impulse.getChannelData(c);
    let seed = c ? 0x9e3779b9 : 0x7f4a7c15;
    const random = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return ((seed >>> 0) / 4294967296) * 2 - 1;
    };
    let lowpassed = 0;
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      if (t < 0.012) continue; // the room answers a moment after the pluck
      const smoothing = 0.35 + 0.6 * Math.min(1, t / 0.6);
      lowpassed += (random() - lowpassed) * (1 - smoothing);
      data[i] = lowpassed * Math.exp(-t / tau) * 0.5;
    }
    early.forEach((t, k) => {
      const i = Math.floor((t + (c ? 0.0023 : 0)) * rate);
      if (i < length) data[i] += (k % 2 ? -1 : 1) * 0.5 * Math.exp(-t / 0.05);
    });
  }
  return impulse;
}

export class KirarAudio {
  private readonly context: AudioContext;
  private buffers: (AudioBuffer | null)[] = manifest.map(() => null);
  private attacks: number[] = manifest.map(() => 0);
  private trims = manifest.map((entry) => dbToGain(entry.balanceDb));
  private voices: Voice[] = [];
  private readonly dryBus: GainNode;
  private readonly roomSend: GainNode;
  private readonly master: GainNode;
  private loading: Promise<void> | null = null;
  private strikes = 0;
  private disposed = false;
  /** Last strikes, newest last — read by browser tests in development. */
  readonly log: StrikeLog[] = [];
  readonly analyser: AnalyserNode;
  enabled = false;

  constructor(context: AudioContext) {
    this.context = context;
    this.dryBus = context.createGain();
    this.master = context.createGain();
    this.master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.roomSend = context.createGain();
    this.roomSend.gain.value = ROOM_SEND;
    const room = context.createConvolver();
    room.buffer = createRoomImpulse(context);

    this.dryBus.connect(this.master);
    this.dryBus.connect(this.roomSend).connect(room).connect(this.master);
    this.master.connect(limiter).connect(this.analyser).connect(context.destination);
  }

  get ready() {
    return this.buffers.every(Boolean);
  }

  /** Loads samples (once) and opens the output. Call after a user gesture. */
  enable(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("disposed"));
    this.enabled = true;
    void this.context.resume();
    this.master.gain.cancelScheduledValues(this.context.currentTime);
    this.master.gain.setTargetAtTime(MASTER_GAIN, this.context.currentTime, 0.02);
    return this.load();
  }

  /** Silences at once (fast fade, no click) and lets the device sleep. */
  disable() {
    this.enabled = false;
    if (this.disposed) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0, now, 0.015);
    for (const voice of this.voices) this.release(voice, now, 0.015);
    window.setTimeout(() => {
      if (!this.enabled && !this.disposed) void this.context.suspend();
    }, 200);
  }

  setRoom(on: boolean) {
    if (this.disposed) return;
    this.roomSend.gain.setTargetAtTime(on ? ROOM_SEND : 0, this.context.currentTime, 0.05);
  }

  /** Play string `index` (0–4) `delayMs` from now, on the audio clock. */
  strike(index: number, strength: number, delayMs = 0) {
    const buffer = this.buffers[index];
    if (!this.enabled || this.disposed || !buffer) return;
    const context = this.context;
    if (context.state !== "running") void context.resume();
    const when = context.currentTime + Math.max(0, delayMs) / 1000;

    // One voice per string: a new pluck damps the old vibration.
    for (const voice of this.voices) {
      if (voice.string === index) this.release(voice, when, CHOKE_SECONDS);
    }
    const sounding = this.voices.filter((voice) => !voice.released);
    if (sounding.length >= MAX_VOICES) this.release(sounding[0], when, CHOKE_SECONDS);

    const source = context.createBufferSource();
    source.buffer = buffer;
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.Q.value = 0.5;
    tone.frequency.value = velocityCutoff(strength);
    const gain = context.createGain();
    gain.gain.value = velocityGain(strength) * this.trims[index];
    source.connect(tone).connect(gain).connect(this.dryBus);
    source.start(when, this.attacks[index]);

    const voice: Voice = { string: index, source, gain, startsAt: when, released: false };
    this.voices.push(voice);
    source.onended = () => {
      this.voices = this.voices.filter((v) => v !== voice);
      source.disconnect();
      tone.disconnect();
      gain.disconnect();
    };

    this.log.push({
      id: ++this.strikes,
      string: index + 1,
      file: manifest[index].file,
      strength,
      scheduledAt: when,
      requestedAt: context.currentTime,
    });
    if (this.log.length > 40) this.log.shift();
  }

  /** A finger landing on a ringing string stops it. */
  damp(index: number) {
    if (this.disposed) return;
    for (const voice of this.voices) {
      if (voice.string === index) this.release(voice, this.context.currentTime, DAMP_SECONDS);
    }
  }

  /** Stops everything and releases the audio device. */
  dispose() {
    if (this.disposed) return;
    this.enabled = false;
    this.disposed = true;
    for (const voice of this.voices) {
      voice.source.onended = null;
      try {
        voice.source.stop();
      } catch {
        // not started yet or already stopped
      }
    }
    this.voices = [];
    void this.context.close();
  }

  private release(voice: Voice, at: number, timeConstant: number) {
    // Once a voice is fading out, later plucks must not push its end back.
    if (voice.released) return;
    voice.released = true;
    const start = Math.max(at, voice.startsAt);
    voice.gain.gain.cancelScheduledValues(start);
    voice.gain.gain.setTargetAtTime(0, start, timeConstant);
    try {
      voice.source.stop(start + timeConstant * 8);
    } catch {
      // already stopped
    }
  }

  private load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = Promise.all(
      manifest.map(async (entry, index) => {
        const buffer = await this.decodeFirstSupported(entry.file);
        this.attacks[index] = findAttack(buffer.getChannelData(0), buffer.sampleRate);
        this.buffers[index] = buffer;
      }),
    ).then(
      () => undefined,
      (error) => {
        this.loading = null; // allow a retry on the next Sound on
        throw error;
      },
    );
    return this.loading;
  }

  private async decodeFirstSupported(file: string): Promise<AudioBuffer> {
    let lastError: unknown;
    for (const format of SOURCE_FORMATS) {
      try {
        const response = await fetch(`${ASSET_PATH}/${file}.${format}`);
        if (!response.ok) throw new Error(`${file}.${format}: ${response.status}`);
        return await this.context.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}
