// Effets de jeu générés à la volée par WebAudioX/jsfx : aucun fichier audio.
class SeekEffectsAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.buffers = new Map();
    this.fleeSources = new Map();
    this.targetStates = new Map();
    this.alarmTimes = new Map();
    this.volume = 0.35;
  }

  attach(context) {
    this.detach();
    if (!context || typeof WebAudiox === 'undefined') return;
    this.context = context;
    this.master = context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(context.destination);
    const square = ["square", 0, 0.35, 0, 0.2, 0, 0.2, 20, 220, 900, 0.5,
      0, 0, 0.01, 0.0003, 0, 0, 0, 0.12, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    const noise = ["noise", 0, 0.4, 0, 0.2, 0, 0.2, 20, 180, 1200, 0.5,
      0, 0, 0.01, 0.0003, 0, 0, 0, 0.16, 0, 0, 0, 0, 1, 0, 0, 0, 0];
    // Les buffers sont générés par l'algorithme jsfx de WebAudioX.
    this.buffers.set('flee', WebAudiox.getBufferFromJsfx(context, square));
    this.buffers.set('alarm', WebAudiox.getBufferFromJsfx(context, square));
    this.buffers.set('explosion', WebAudiox.getBufferFromJsfx(context, noise));
    this.buffers.set('decoy', WebAudiox.getBufferFromJsfx(context, square));
  }

  setVolume(value) {
    this.volume = Math.max(0, Math.min(1, Number(value) || 0));
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
    }
  }

  play(name, durationSeconds, volume = 1, loop = false) {
    if (!this.context || !this.master || !this.buffers.has(name)) return null;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    source.buffer = this.buffers.get(name);
    source.loop = loop;
    gain.gain.setValueAtTime(volume, now);
    source.connect(gain).connect(this.master);
    source.start(now);
    if (!loop) source.stop(now + durationSeconds);
    return source;
  }

  startFlee(target) {
    if (this.fleeSources.has(target)) return;
    const source = this.play('flee', 0.7, 0.45, true);
    if (!source) return;
    const sweep = this.context.createOscillator();
    const sweepGain = this.context.createGain();
    const now = this.context.currentTime;
    sweep.type = 'sawtooth';
    sweep.frequency.setValueAtTime(160, now);
    sweepGain.gain.setValueAtTime(0.3, now);
    sweep.connect(sweepGain).connect(this.master);
    sweep.start(now);
    this.fleeSources.set(target, { source, sweep, sweepGain });
  }

  stopFlee(target) {
    const nodes = this.fleeSources.get(target);
    if (!nodes) return;
    try { nodes.source.stop(); } catch { /* source déjà arrêté */ }
    try { nodes.sweep.stop(); } catch { /* oscillateur déjà arrêté */ }
    this.fleeSources.delete(target);
  }

  updateFleeSweep(target) {
    const nodes = this.fleeSources.get(target);
    if (!nodes || !this.context) return;
    const elapsed = Math.max(0, Number(target.elapsedFleeMs) || 0);
    const duration = Math.max(1, Number(target.maxFleeDuration) * 1000 || 1);
    const progress = Math.min(1, elapsed / duration);
    const frequency = 160 + progress * 1440;
    nodes.sweep.frequency.setTargetAtTime(frequency, this.context.currentTime, 0.04);
  }

  observeTarget(target) {
    // Ne pas mémoriser une transition silencieuse avant l'activation audio.
    if (!this.context) return;
    if (target.state === 'fleeing' && !this.fleeSources.has(target)) this.startFlee(target);
    if (target.state === 'fleeing') this.updateFleeSweep(target);
    if (target.state !== 'fleeing') this.stopFlee(target);
    // Tant que la détection reste active, le cooldown autorise au plus une alarme/s.
    if (target.detected) this.playAlarm(target);
    this.targetStates.set(target, { fleeing: target.state === 'fleeing', detected: !!target.detected });
  }

  synchronizeTargets(targets) {
    const active = new Set(targets);
    for (const target of this.fleeSources.keys()) {
      if (!active.has(target)) this.stopFlee(target);
    }
    for (const target of this.targetStates.keys()) {
      if (!active.has(target)) {
        this.targetStates.delete(target);
        this.alarmTimes.delete(target);
      }
    }
    for (const target of targets) this.observeTarget(target);
  }

  playAlarm(target) {
    if (!this.context) return;
    const now = this.context.currentTime;
    const last = this.alarmTimes.get(target) ?? -Infinity;
    if (now - last < 1) return;
    this.alarmTimes.set(target, now);
    this.play('alarm', 0.4, 0.8);
  }

  playExplosion() { this.play('explosion', 0.7, 0.55); }
  playDecoyRelease() { this.play('decoy', 0.18, 0.3); }

  detach() {
    for (const target of this.fleeSources.keys()) this.stopFlee(target);
    if (this.master) this.master.disconnect();
    this.context = null;
    this.master = null;
    this.buffers.clear();
    this.targetStates.clear();
    this.alarmTimes.clear();
  }
}
