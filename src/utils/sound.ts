/**
 * 100% Procedural Web Audio API Sound Effects & Screen Reader Voice Announcements
 * Zero external audio files — eliminates 404s and provides crisp tactile table-football feedback.
 */

class SubbuteoAudioEngine {
  private ctx: AudioContext | null = null;
  public enabled = true;
  public voiceAnnouncements = false;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /** Crisp index-finger snap against polished acrylic Subbuteo base */
  public playFlick(power: number, panX = 0) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    osc.type = 'triangle';
    const baseFreq = 260 + power * 240;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.065);

    gain.gain.setValueAtTime(Math.min(0.45, 0.12 + power * 0.32), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    if (panner) {
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, panX / 60)), now);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      osc.connect(gain);
      gain.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + 0.075);
  }

  /** Hollow 21mm celluloid/plastic ball impact */
  public playBallHit(speed: number, panX = 0) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    const intensity = Math.min(1, speed / 55);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520 + intensity * 310, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.045);

    gain.gain.setValueAtTime(0.08 + intensity * 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    if (panner) {
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, panX / 60)), now);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      osc.connect(gain);
      gain.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + 0.055);
  }

  /** Acrylic base-to-base clack */
  public playBaseClack(speed: number, panX = 0) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;

    const intensity = Math.min(1, speed / 45);
    osc.type = 'square';
    osc.frequency.setValueAtTime(840 + intensity * 400, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.032);

    gain.gain.setValueAtTime(0.05 + intensity * 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.036);

    if (panner) {
      panner.pan.setValueAtTime(Math.max(-0.9, Math.min(0.9, panX / 60)), now);
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      osc.connect(gain);
      gain.connect(ctx.destination);
    }

    osc.start(now);
    osc.stop(now + 0.04);
  }

  /** Metallic goal post ping */
  public playPostPing() {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1480, now);
    osc.frequency.exponentialRampToValueAtTime(1120, now + 0.22);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Referee whistle */
  public playWhistle(kind: 'short' | 'long' = 'short') {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const duration = kind === 'long' ? 0.42 : 0.16;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(2780, now);
    osc2.frequency.setValueAtTime(2845, now); // Pea trill beat frequency

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.02);
    gain.gain.setValueAtTime(0.2, now + duration - 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + duration + 0.02);
    osc2.stop(now + duration + 0.02);
  }

  /** Goal celebration chord & roar */
  public playGoalHorn() {
    const ctx = this.getContext();
    if (!ctx) return;

    this.playWhistle('long');
    const now = ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.05);

      gain.gain.setValueAtTime(0.001, now + idx * 0.05);
      gain.gain.linearRampToValueAtTime(0.09, now + idx * 0.05 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.05);
      osc.stop(now + 0.8);
    });
  }

  /** Optional screen-reader / TTS voice announcement for accessibility */
  public announce(message: string) {
    if (!this.voiceAnnouncements || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(message);
      utter.lang = 'it-IT';
      utter.rate = 1.08;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore if speech synthesis is blocked
    }
  }
}

export const soundEngine = new SubbuteoAudioEngine();
