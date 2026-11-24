/**
 * The alarm tones, synthesised with Web Audio rather than shipped as audio
 * files: nothing to download, so the alarm still rings when the restaurant's
 * connection is down, and each source gets a tone that is told apart by its
 * rhythm as much as its pitch — a cashier should know which app the order came
 * from without looking at the screen.
 */
export type SoundId = "bell" | "siren" | "chime" | "buzz" | "ping";

export const SOUND_LABEL: Record<SoundId, string> = {
  bell: "Ghanti — do tez beep",
  siren: "Siren — upar-neeche",
  chime: "Chime — teen sur",
  buzz: "Buzzer — bhari gunjan",
  ping: "Ping — ek lamba beep",
};

interface Note {
  /** Hz */
  freq: number;
  /** seconds from the start of the pattern */
  at: number;
  /** seconds */
  dur: number;
  type: OscillatorType;
  /** Hz to glide to over the note, for the siren */
  glideTo?: number;
}

const PATTERNS: Record<SoundId, Note[]> = {
  bell: [
    { freq: 1180, at: 0, dur: 0.13, type: "triangle" },
    { freq: 1180, at: 0.2, dur: 0.13, type: "triangle" },
  ],
  siren: [
    { freq: 620, at: 0, dur: 0.38, type: "sawtooth", glideTo: 1080 },
    { freq: 1080, at: 0.38, dur: 0.38, type: "sawtooth", glideTo: 620 },
  ],
  chime: [
    { freq: 660, at: 0, dur: 0.16, type: "sine" },
    { freq: 880, at: 0.16, dur: 0.16, type: "sine" },
    { freq: 1175, at: 0.32, dur: 0.26, type: "sine" },
  ],
  buzz: [
    { freq: 220, at: 0, dur: 0.17, type: "square" },
    { freq: 220, at: 0.24, dur: 0.17, type: "square" },
    { freq: 220, at: 0.48, dur: 0.17, type: "square" },
  ],
  ping: [{ freq: 1480, at: 0, dur: 0.5, type: "sine" }],
};

/** How long one run of the pattern takes, so a repeat can be scheduled after it. */
export function patternLength(id: SoundId): number {
  return PATTERNS[id].reduce((end, n) => Math.max(end, n.at + n.dur), 0) + 0.12;
}

/**
 * Plays one run of a pattern. Each note gets its own short attack/release so
 * the tone doesn't click, which on a cheap tablet speaker sounds like a fault.
 */
export function playPattern(ctx: AudioContext, id: SoundId, volume: number, startAt = 0): void {
  const t0 = ctx.currentTime + startAt;
  for (const note of PATTERNS[id]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, t0 + note.at);
    if (note.glideTo !== undefined) {
      osc.frequency.linearRampToValueAtTime(note.glideTo, t0 + note.at + note.dur);
    }

    const peak = Math.max(0.0001, Math.min(1, volume)) * 0.32;
    gain.gain.setValueAtTime(0.0001, t0 + note.at);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + note.at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.at + note.dur);

    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + note.at);
    osc.stop(t0 + note.at + note.dur + 0.02);
  }
}
