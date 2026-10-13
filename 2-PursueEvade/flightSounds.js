// Sons du combat aérien, synthétisés avec l'API Web Audio et la bibliothèque WebAudiox
// (libraries/webaudiox/webaudiox.js). WebAudiox fournit :
// - WebAudiox.LineOut : sortie unique avec volume (lineOut.volume), sourdine (toggleMute) et
//   coupure automatique quand l'onglet est caché ;
// - WebAudiox.Analyser2Volume : niveau de sortie lissé, affiché dans le menu.
// Aucun fichier audio : tout est synthétisé.
// - Moteurs en continu : grondement grave et souffle filtré des chasseurs (plus aigu et plus fort
//   avec la vitesse et la post-combustion), sifflement du réacteur de l'avion.
// - Alarme de missile (RWR) de l'avion : bips qui s'accélèrent quand un missile verrouillé
//   approche. Ton de verrouillage des chasseurs : il monte pendant le verrouillage puis devient
//   continu.
// - Événements ponctuels, placés dans le champ stéréo selon la position à l'écran : tir de
//   missile, leurres (crépitement), explosion (plus grave et plus longue pour l'avion).
// Les fonctions *Params sont pures. Un navigateur n'autorise l'audio qu'après un geste de
// l'utilisateur : le son démarre donc avec la case à cocher, jamais automatiquement.
const FlightSounds = (() => {
  const INITIAL_VOLUME = 0.6;
  const SMOOTHING = 0.06;          // constante de temps du suivi des paramètres, en secondes
  const clamp01 = value => Math.min(1, Math.max(0, value));

  // Régime des moteurs. Toutes les entrées sont dans [0, 1].
  function engineParams({ fighterSpeed = 0, afterburner = 0, planeSpeed = 0 } = {}) {
    const speed = clamp01(fighterSpeed);
    const burn = clamp01(afterburner);
    const plane = clamp01(planeSpeed);
    return {
      rumbleFrequency: 55 + 90 * speed,
      rumbleGain: 0.1 + 0.14 * speed,
      noiseCutoff: 350 + 1800 * speed + 2500 * burn,
      noiseGain: 0.03 + 0.1 * speed + 0.22 * burn,
      whineFrequency: 500 + 900 * plane,
      whineGain: plane > 0 ? 0.02 + 0.03 * plane : 0,
    };
  }

  // Alarme de missile : level de 0 (aucun missile) à 1 (missile tout proche).
  function warningParams(level) {
    const l = clamp01(level);
    return { rate: 2 + 12 * l, gain: l > 0 ? 0.12 + 0.12 * l : 0 };
  }

  // Ton de verrouillage des chasseurs : progress de 0 à 1, puis continu et aigu une fois verrouillé.
  function lockToneParams(progress, locked) {
    const p = clamp01(progress);
    if (p <= 0) return { frequency: 600, gain: 0 };
    if (locked) return { frequency: 1500, gain: 0.07 };
    return { frequency: 600 + 700 * p, gain: 0.04 + 0.03 * p };
  }

  // Événements ponctuels : bruit filtré qui s'éteint (noise) et/ou coup grave (thump).
  const EVENTS = {
    launch: {
      noise: { from: 3000, to: 300, seconds: 0.9, gain: 0.5 },
      thump: { from: 140, to: 50, seconds: 0.4, gain: 0.5 },
    },
    flare: {
      crackles: 4, spacing: 0.05,
      noise: { from: 6000, to: 2000, seconds: 0.08, gain: 0.35 },
    },
    explosion: {
      noise: { from: 1200, to: 80, seconds: 1.4, gain: 0.9 },
      thump: { from: 90, to: 28, seconds: 0.8, gain: 0.9 },
    },
  };

  // Spécification d'un événement pour une intensité de 0 à 1 : un son faible est plus doux et
  // plus court. null pour un événement inconnu.
  function eventSpec(name, intensity = 1) {
    const base = EVENTS[name];
    if (!base) return null;
    const i = Math.min(1, Math.max(0.2, intensity));
    const scale = part => part && { ...part, gain: part.gain * i, seconds: part.seconds * (0.6 + 0.4 * i) };
    return { crackles: base.crackles, spacing: base.spacing, noise: scale(base.noise), thump: scale(base.thump) };
  }

  // intensité du son d'une explosion : l'avion (échelle 2,4) fait le maximum
  function explosionIntensity(scale) {
    return clamp01(scale / 2.4);
  }

  // getContextClass et getWebAudiox sont injectables pour tester sans navigateur
  function createEngine({
    getContextClass = () => globalThis.AudioContext || globalThis.webkitAudioContext,
    getWebAudiox = () => globalThis.WebAudiox,
  } = {}) {
    let context = null;
    let lineOut = null;
    let bus = null;
    let meter = null;
    let noise = null;
    let nodes = null;
    let running = false;
    let volume = INITIAL_VOLUME;

    function gainNode(value = 0, destination = bus) {
      const node = context.createGain();
      node.gain.value = value;
      node.connect(destination);
      return node;
    }

    function oscillator(type, frequency, destination) {
      const node = context.createOscillator();
      node.type = type;
      node.frequency.value = frequency;
      node.connect(destination);
      node.start();
      return node;
    }

    function build() {
      const library = getWebAudiox();
      const ContextClass = getContextClass();
      if (!library || !ContextClass) return false;
      context = new ContextClass();
      lineOut = new library.LineOut(context);
      lineOut.volume = volume;
      bus = context.createGain();
      bus.connect(lineOut.destination);
      // niveau de sortie mesuré par WebAudiox
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      bus.connect(analyser);
      meter = new library.Analyser2Volume(analyser, 0.2);

      // deux secondes de bruit blanc, réutilisées pour le souffle et les événements
      const length = Math.floor(context.sampleRate * 2);
      noise = context.createBuffer(1, length, context.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      nodes = {};
      // souffle des réacteurs : bruit en boucle, filtré passe-bas
      nodes.noiseGain = gainNode();
      nodes.noiseFilter = context.createBiquadFilter();
      nodes.noiseFilter.type = 'lowpass';
      nodes.noiseFilter.connect(nodes.noiseGain);
      nodes.noiseSource = context.createBufferSource();
      nodes.noiseSource.buffer = noise;
      nodes.noiseSource.loop = true;
      nodes.noiseSource.connect(nodes.noiseFilter);
      nodes.noiseSource.start();
      // grondement des chasseurs et sifflement de l'avion
      nodes.rumbleGain = gainNode();
      nodes.rumbleFilter = context.createBiquadFilter();
      nodes.rumbleFilter.type = 'lowpass';
      nodes.rumbleFilter.frequency.value = 220;
      nodes.rumbleFilter.connect(nodes.rumbleGain);
      nodes.rumble = oscillator('sawtooth', 60, nodes.rumbleFilter);
      nodes.whineGain = gainNode();
      nodes.whine = oscillator('triangle', 600, nodes.whineGain);
      // alarme de missile : un bip de 880 Hz haché par une onde carrée dont la cadence suit le danger
      nodes.warnLevel = gainNode();
      nodes.warnGate = gainNode(0.5, nodes.warnLevel);
      nodes.warnTone = oscillator('sine', 880, nodes.warnGate);
      nodes.warnLfoGain = gainNode(0.5, nodes.warnGate.gain);
      nodes.warnLfo = oscillator('square', 4, nodes.warnLfoGain);
      // ton de verrouillage
      nodes.lockGain = gainNode();
      nodes.lockTone = oscillator('sine', 600, nodes.lockGain);
      return true;
    }

    function follow(param, value, now) {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, SMOOTHING);
    }

    function start() {
      if (!context && !build()) return false;
      context.resume();
      running = true;
      return true;
    }

    function stop() {
      if (!running) return;
      running = false;
      context.suspend();
    }

    // state : sortie de AirBattle.soundState(), valeurs de 0 à 1
    function update(state) {
      if (!running) return;
      const now = context.currentTime;
      const engine = engineParams(state);
      follow(nodes.rumble.frequency, engine.rumbleFrequency, now);
      follow(nodes.rumbleGain.gain, engine.rumbleGain, now);
      follow(nodes.noiseFilter.frequency, engine.noiseCutoff, now);
      follow(nodes.noiseGain.gain, engine.noiseGain, now);
      follow(nodes.whine.frequency, engine.whineFrequency, now);
      follow(nodes.whineGain.gain, engine.whineGain, now);
      const warning = warningParams(state.warning ?? 0);
      follow(nodes.warnLfo.frequency, warning.rate, now);
      follow(nodes.warnLevel.gain, warning.gain, now);
      const lock = lockToneParams(state.lock ?? 0, Boolean(state.locked));
      follow(nodes.lockTone.frequency, lock.frequency, now);
      follow(nodes.lockGain.gain, lock.gain, now);
    }

    // coup de bruit filtré qui s'éteint
    function burst(spec, when, pan) {
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      source.buffer = noise;
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(spec.from, when);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to), when + spec.seconds);
      gain.gain.setValueAtTime(spec.gain, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + spec.seconds);
      panner.pan.value = pan;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(panner);
      panner.connect(bus);
      source.start(when);
      source.stop(when + spec.seconds + 0.05);
    }

    // coup grave dont la hauteur chute
    function thump(spec, when, pan) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      const panner = context.createStereoPanner();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(spec.from, when);
      osc.frequency.exponentialRampToValueAtTime(Math.max(10, spec.to), when + spec.seconds);
      gain.gain.setValueAtTime(spec.gain, when);
      gain.gain.exponentialRampToValueAtTime(0.001, when + spec.seconds);
      panner.pan.value = pan;
      osc.connect(gain);
      gain.connect(panner);
      panner.connect(bus);
      osc.start(when);
      osc.stop(when + spec.seconds + 0.05);
    }

    // joue un événement ('launch', 'flare', 'explosion') ; pan de -1 (gauche) à 1 (droite)
    function play(name, { pan = 0, intensity = 1 } = {}) {
      if (!running) return false;
      const spec = eventSpec(name, intensity);
      if (!spec) return false;
      const now = context.currentTime;
      const position = Math.min(1, Math.max(-1, pan));
      if (spec.crackles) {
        for (let i = 0; i < spec.crackles; i++) burst(spec.noise, now + i * spec.spacing, position);
      } else if (spec.noise) {
        burst(spec.noise, now, position);
      }
      if (spec.thump) thump(spec.thump, now, position);
      return true;
    }

    function setVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('Le volume doit être un nombre entre 0 et 1.');
      }
      volume = value;
      if (lineOut) lineOut.volume = value;
    }

    // sourdine de WebAudiox (toggleMute) ; sans effet avant le démarrage
    function setMuted(muted) {
      if (lineOut && lineOut.isMuted !== muted) lineOut.toggleMute();
    }

    // niveau de sortie lissé, de 0 à 1, mesuré par WebAudiox.Analyser2Volume
    function level() {
      return running && meter ? meter.smoothedValue() : 0;
    }

    function bindCheckbox(checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          // sans API audio ou sans WebAudiox, la case revient décochée
          if (!start()) checkbox.checked = false;
        } else {
          stop();
        }
      });
    }

    function bindVolumeSlider(input, output) {
      const synchronize = () => {
        setVolume(Number(input.value));
        output.value = `${Math.round(volume * 100)} %`;
      };
      input.addEventListener('input', synchronize);
      synchronize();
    }

    // les événements du combat jouent leur son ; renvoie la fonction qui les écoute
    function attach(battle) {
      battle.onEvent((name, data) => {
        if (name === 'launch' || name === 'flare') play(name, { pan: data.pan });
        else if (name === 'explosion') play('explosion', { pan: data.pan, intensity: explosionIntensity(data.scale) });
      });
    }

    return { start, stop, update, play, setVolume, setMuted, level, bindCheckbox, bindVolumeSlider, attach,
      isRunning: () => running, getVolume: () => volume };
  }

  const engine = createEngine();

  return { INITIAL_VOLUME, EVENTS, engineParams, warningParams, lockToneParams, eventSpec,
    explosionIntensity, createEngine, ...engine };
})();
