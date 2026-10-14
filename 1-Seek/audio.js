// Mappings partagés par le son et le centre du dégradé (coordonnées normalisées).
const SeekAmbience = {
  clamp(value) { return Math.max(0, Math.min(1, value)); },
  parameters(x, y, mouseX) {
    x = this.clamp(x);
    y = this.clamp(y);
    mouseX = this.clamp(mouseX);
    return {
      cutoff: 120 * (8000 / 120) ** x,
      pitch: 90 * 2 ** ((1 - y) * 2),
      fmRate: 1 + mouseX * 9,
      fmDepth: 5 + mouseX * 100,
    };
  },
};

class PsychedelicAudio {
  constructor(contextFactory = () => new (window.AudioContext || window.webkitAudioContext)()) {
    this.contextFactory = contextFactory;
    this.context = null;
    this.running = false;
    this.nodes = [];
    this.sources = [];
    this.volume = 0.07;
  }

  // Séparé pour tester le vrai graphe avec OfflineAudioContext.
  build(context) {
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.volume;
    this.filter = context.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 1.2;
    this.filter.frequency.value = 900;
    this.carrier = context.createOscillator();
    this.carrier.type = 'sawtooth';
    this.carrier.frequency.value = 180;
    this.harmony = context.createOscillator();
    this.harmony.type = 'triangle';
    this.harmony.frequency.value = 270;
    this.modulator = context.createOscillator();
    this.modulator.frequency.value = 3;
    this.modulationDepth = context.createGain();
    this.modulationDepth.gain.value = 30;
    this.harmonyGain = context.createGain();
    this.harmonyGain.gain.value = 0.3;
    this.fmAnalyser = context.createAnalyser();
    this.fmAnalyser.fftSize = 256;
    this.fmSamples = new Float32Array(this.fmAnalyser.fftSize);
    this.outputAnalyser = context.createAnalyser();
    this.outputAnalyser.fftSize = 2048;

    this.modulator.connect(this.modulationDepth);
    this.modulationDepth.connect(this.carrier.frequency);
    this.modulationDepth.connect(this.harmony.frequency);
    // Le dégradé lit ce même modulateur, pas une sinusoïde visuelle indépendante.
    this.modulator.connect(this.fmAnalyser);
    this.carrier.connect(this.filter);
    this.harmony.connect(this.harmonyGain).connect(this.filter);
    this.filter.connect(this.master).connect(this.outputAnalyser).connect(context.destination);
    this.nodes = [this.master, this.filter, this.carrier, this.harmony, this.modulator,
      this.modulationDepth, this.harmonyGain, this.fmAnalyser, this.outputAnalyser];
    this.sources = [this.carrier, this.harmony, this.modulator];
    for (const source of this.sources) source.start();
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  async start() {
    if (this.running) return;
    const context = this.contextFactory();
    try {
      this.build(context);
      await context.resume();
      this.running = true;
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  // Le gain coupe immédiatement TOUT le mix ; les sources et le contexte sont détruits.
  silence(at = this.context?.currentTime ?? 0) {
    if (!this.master) return;
    this.master.gain.cancelScheduledValues(at);
    this.master.gain.setValueAtTime(0, at);
  }

  async stop() {
    this.running = false;
    const context = this.context;
    if (!context) return;
    this.silence();
    for (const source of this.sources) {
      try { source.stop(); } catch { /* Source déjà arrêtée. */ }
    }
    for (const node of this.nodes) node.disconnect();
    this.sources = [];
    this.nodes = [];
    this.context = null;
    this.master = null;
    if (context.state !== 'closed') await context.close();
  }

  update(x, y, mouseX) {
    if (!this.running) return;
    const parameters = SeekAmbience.parameters(x, y, mouseX);
    const now = this.context.currentTime;
    this.filter.frequency.setTargetAtTime(parameters.cutoff, now, 0.06);
    this.carrier.frequency.setTargetAtTime(parameters.pitch, now, 0.06);
    this.harmony.frequency.setTargetAtTime(parameters.pitch * 1.5, now, 0.06);
    this.modulator.frequency.setTargetAtTime(parameters.fmRate, now, 0.06);
    this.modulationDepth.gain.setTargetAtTime(parameters.fmDepth, now, 0.06);
  }

  modulation() {
    if (!this.running) return 0;
    this.fmAnalyser.getFloatTimeDomainData(this.fmSamples);
    return this.fmSamples[this.fmSamples.length - 1];
  }
}
