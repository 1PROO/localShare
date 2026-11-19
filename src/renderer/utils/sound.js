let sharedAudioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

/**
 * Synthesize a clean, pleasant, distinct notification chime offline via Web Audio API.
 * Uses a soft harmonic triad progression (G5 -> C6 -> E6) with gentle envelopes
 * so there are zero clicks or external audio file dependencies.
 */
export function playNotificationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return false;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.18, now);
    masterGain.connect(ctx.destination);

    const notes = [
      { freq: 783.99, start: 0, duration: 0.14, peak: 0.5 },      // G5
      { freq: 1046.5, start: 0.075, duration: 0.22, peak: 0.65 }, // C6
      { freq: 1318.51, start: 0.15, duration: 0.32, peak: 0.5 }   // E6
    ];

    for (const note of notes) {
      const startTime = now + note.start;
      const stopTime = startTime + note.duration;

      const osc = ctx.createOscillator();
      const harmonic = ctx.createOscillator();
      const noteGain = ctx.createGain();
      const harmonicGain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, startTime);

      harmonic.type = 'triangle';
      harmonic.frequency.setValueAtTime(note.freq * 2, startTime);

      noteGain.gain.setValueAtTime(0.0001, startTime);
      noteGain.gain.linearRampToValueAtTime(note.peak, startTime + 0.015);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

      harmonicGain.gain.setValueAtTime(0.0001, startTime);
      harmonicGain.gain.linearRampToValueAtTime(note.peak * 0.12, startTime + 0.012);
      harmonicGain.gain.exponentialRampToValueAtTime(0.0001, stopTime * 0.98);

      osc.connect(noteGain);
      harmonic.connect(harmonicGain);
      noteGain.connect(masterGain);
      harmonicGain.connect(masterGain);

      osc.start(startTime);
      harmonic.start(startTime);
      osc.stop(stopTime + 0.02);
      harmonic.stop(stopTime + 0.02);
    }

    return true;
  } catch {
    return false;
  }
}

export default playNotificationChime;
