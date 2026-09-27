/**
 * Plays the five real Kirar string recordings with Web Audio.
 *
 *   voice ─► string trim ─► dry bus ─┬──────────────────► master ─► safety limiter ─► out
 *                                    └─► room send ─► convolver ┘
 *
 * - Samples are fetched and decoded once, on the first deliberate "Sound on".
 *   Nothing is created or played before that gesture (autoplay rules).
 * - Each string is one voice, like the instrument: plucking a string again
 *   damps its previous vibration in ~20 ms and starts the new one at once.
 *   Different strings ring together.
 * - Pluck strength sets level and brightness (soft plucks are slightly darker).
 * - The limiter only engages when fast sweeps stack; single plucks pass
 *   untouched, transient intact.
 * - One synthetic small-room impulse is shared by all strings. The dry signal
 *   stays dominant, and the room can be switched off.
 */
import manifest from "./audio/manifest.json";

const SOURCE_FORMATS = ["webm", "mp3"] as const; // Opus first, MP3 fallback
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
  const seconds = 1.1;
  const length = Math.floor(rate * seconds);
  const impulse = context.createBuffer(2, length, rate);
  const rt60 = 0.85;
  const tau = rt60 / 6.91;
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
      // Air and soft furnishings absorb highs faster than lows.
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
  private context: AudioContext | null = null;
  private buffers: (AudioBuffer | null)[] = [null, null, null, null, null];
  private attacks: number[] = [0, 0, 0, 0, 0];
  private trims = manifest.map((entry) => dbToGain(entry.balanceDb));
  private voices: Voice[] = [];
  private dryBus: GainNode | null = null;
  private roomSend: GainNode | null = null;
  private master: GainNode | null = null;
  private loading: Promise<void> | null = null;
  private suspendTimer = 0;
  private roomOn = true;
  private strikes = 0;
  /** Last strikes, newest last — read by the lab's own tests. */
  readonly log: StrikeLog[] = [];
  analyser: AnalyserNode | null = null;
  enabled = false;

  get ready() {
    return this.buffers.every(Boolean);
  }

  /**
   * Must be called from a click/tap/key handler: the AudioContext is created
   * and resumed synchronously inside the gesture, then samples load.
   */
  enable(): Promise<void> {
    this.enabled = true;
    window.clearTimeout(this.suspendTimer);
    const context = this.ensureContext();
    void context.resume();
    this.master?.gain.setTargetAtTime(MASTER_GAIN, context.currentTime, 0.02);
    return this.load();
  }

  disable() {
    this.enabled = false;
    const context = this.context;
    if (!context || !this.master) return;
    // Quick fade rather than a click, then let the device sleep.
    this.master.gain.setTargetAtTime(0, context.currentTime, 0.03);
    this.suspendTimer = window.setTimeout(() => {
      this.voices.forEach((voice) => voice.source.stop());
      this.voices = [];
      void context.suspend();
    }, 250);
  }

  setRoom(on: boolean) {
    this.roomOn = on;
    if (this.context && this.roomSend) {
      this.roomSend.gain.setTargetAtTime(on ? ROOM_SEND : 0, this.context.currentTime, 0.05);
    }
  }

  /** Play string `index` (0–4) `delayMs` from now, on the audio clock. */
  strike(index: number, strength: number, delayMs = 0) {
    const context = this.context;
    const buffer = this.buffers[index];
    if (!this.enabled || !context || !buffer || !this.dryBus) return;
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
    const context = this.context;
    if (!context) return;
    for (const voice of this.voices) {
      if (voice.string === index) this.release(voice, context.currentTime, DAMP_SECONDS);
    }
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

  private ensureContext(): AudioContext {
    if (this.context) return this.context;
    const context = new AudioContext({ latencyHint: "interactive" });

    const dry = context.createGain();
    const master = context.createGain();
    master.gain.value = 0;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.15;
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;

    const send = context.createGain();
    send.gain.value = this.roomOn ? ROOM_SEND : 0;
    const room = context.createConvolver();
    room.buffer = createRoomImpulse(context);

    dry.connect(master);
    dry.connect(send).connect(room).connect(master);
    master.connect(limiter).connect(analyser).connect(context.destination);

    // iOS unlock: a silent one-sample buffer played inside the gesture.
    const silent = context.createBufferSource();
    silent.buffer = context.createBuffer(1, 1, context.sampleRate);
    silent.connect(context.destination);
    silent.start();

    this.context = context;
    this.dryBus = dry;
    this.roomSend = send;
    this.master = master;
    this.analyser = analyser;
    return context;
  }

  private load(): Promise<void> {
    if (this.loading) return this.loading;
    const context = this.ensureContext();
    this.loading = Promise.all(
      manifest.map(async (entry, index) => {
        const buffer = await this.decodeFirstSupported(context, entry.file);
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

  private async decodeFirstSupported(context: AudioContext, file: string): Promise<AudioBuffer> {
    let lastError: unknown;
    for (const format of SOURCE_FORMATS) {
      try {
        const response = await fetch(`/motion-lab/audio/${file}.${format}`);
        if (!response.ok) throw new Error(`${file}.${format}: ${response.status}`);
        return await context.decodeAudioData(await response.arrayBuffer());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
}

let shared: KirarAudio | null = null;

/** One engine per page: the hero instrument and any future ones share it. */
export function getKirarAudio(): KirarAudio {
  shared ??= new KirarAudio();
  return shared;
}
