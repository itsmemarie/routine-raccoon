import { isNativePlatform } from "./platform";

/**
 * The quiet ping when a timer runs out (TECH_SPEC §1.2 platform adapter). Web: synthesised with
 * Web Audio, so there is no sound file to cache and it plays over music instead of pausing it.
 * Native: a no-op, because the scheduled notification already makes the phone's own sound.
 *
 * Browsers only let a page make sound after a tap, so call `primeChime` from the tap that starts
 * the timer. Neither function rejects: a missed ping must not break the timer, and the bar still
 * says "Time's up".
 */

/** Two soft notes a fifth apart (Hz). */
const NOTES = [880, 1318.5] as const;
const NOTE_GAP_S = 0.16;
const NOTE_LENGTH_S = 0.7;
/** Out of 1. Noticeable in a quiet room at normal volume, and no louder. */
const PEAK_GAIN = 0.2;
/** Audio that takes longer to start is blocked: ringing later would land on some random tap. */
const MAX_WAIT_MS = 1_000;

let context: AudioContext | null = null;

async function startAudio(): Promise<AudioContext | null> {
  if (isNativePlatform() || typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  if (context.state !== "running") await context.resume();
  return context;
}

function ring(audio: AudioContext): void {
  NOTES.forEach((frequency, index) => {
    const at = audio.currentTime + index * NOTE_GAP_S;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PEAK_GAIN, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + NOTE_LENGTH_S);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(at);
    oscillator.stop(at + NOTE_LENGTH_S);
  });
}

/** Unlocks sound. Call it directly from a tap, before any `await`. */
export async function primeChime(): Promise<void> {
  try {
    await startAudio();
  } catch {
    // No audio here (see the note above): playChime fails the same way and the bar still shows.
  }
}

/** Plays the ping once, or does nothing if the browser will not allow sound right now. */
export async function playChime(): Promise<void> {
  const askedAt = Date.now();
  try {
    const audio = await startAudio();
    if (audio && Date.now() - askedAt < MAX_WAIT_MS) ring(audio);
  } catch {
    // No audio here (see the note above): the bar and the vibration still say time's up.
  }
}
