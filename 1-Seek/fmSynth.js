// Synthèse FM (modulation de fréquence) avec l'API Web Audio native, pilotée par la
// position de la cible :
// - x -> hauteur (fréquence de la porteuse), de façon exponentielle et continue : 3 octaves
//   de 110 à 880 Hz sur toute la largeur du canvas, donc la hauteur suit exactement le
//   déplacement, sans paliers ;
// - y -> profondeur de modulation (indice) : en haut un timbre brillant, en bas un son pur ;
// - x -> panoramique stéréo ;
// - un vibrato lent (LFO) s'ajoute à la porteuse.
// Le graphe audio : modulateur -> gain (déviation en Hz) -> fréquence de la porteuse, plus
// LFO -> gain (vibrato) -> fréquence de la porteuse ; porteuse -> amplitude -> pan -> volume.
// modulationState est une fonction pure qui donne tous les paramètres FM à un instant : le
// dégradé (gradientBackground.js) lit exactement les mêmes valeurs, donc image et son sont liés.
// Un navigateur n'autorise l'audio qu'après un geste de l'utilisateur : le son démarre donc
// avec la case à cocher, jamais automatiquement.
const FMSynth = (() => {
  const MIN_FREQUENCY = 110;
  const MAX_FREQUENCY = 880;
  const VIBRATO_RATE = 5.5;       // Hz
  const VIBRATO_DEPTH = 0.012;    // fraction de la porteuse (environ 20 cents)
  const AMPLITUDE = 0.6;
  const MASTER_MAX = 0.3;
  const INITIAL_VOLUME = 0.5;
  const SMOOTHING = 0.02;         // constante de temps du suivi des paramètres, en secondes
  const FADE = 0.03;              // constante de temps de l'entrée et de la sortie du son
  const SUSPEND_DELAY_MS = 150;   // laisse retomber le son avant de suspendre le contexte

  const PARAMETERS = {
    ratio: { min: 0.5, max: 4, step: 0.5, initial: 2, decimals: 1 },      // modulateur / porteuse
    maxIndex: { min: 0, max: 8, step: 0.5, initial: 4, decimals: 1 },     // indice en haut du canvas
  };

  const clamp01 = value => Math.min(1, Math.max(0, value));

  function createSettings() {
    const settings = {};
    for (const [name, range] of Object.entries(PARAMETERS)) settings[name] = range.initial;
    return settings;
  }

  function setParameter(settings, name, value) {
    const range = PARAMETERS[name];
    if (!range) throw new RangeError(`Paramètre inconnu : ${name}.`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max) {
      throw new RangeError(`${name} doit être un nombre entre ${range.min} et ${range.max}.`);
    }
    settings[name] = value;
  }

  function bindSlider(input, output, name, settings) {
    const { decimals } = PARAMETERS[name];
    const synchronize = () => {
      setParameter(settings, name, Number(input.value));
      output.value = settings[name].toFixed(decimals);
    };
    input.addEventListener('input', synchronize);
    synchronize();
  }

  // Position horizontale normalisée dans [0, 1] ; une largeur nulle donne le milieu.
  function normalized(position, size) {
    return size > 0 ? clamp01(position / size) : 0.5;
  }

  // Hauteur exponentielle : chaque tiers de la largeur monte d'une octave.
  function carrierFrequency(x, w) {
    return MIN_FREQUENCY * (MAX_FREQUENCY / MIN_FREQUENCY) ** normalized(x, w);
  }

  // Indice de modulation : maximal en haut du canvas (y = 0), nul en bas.
  function modulationIndex(y, h, maxIndex) {
    return maxIndex * (1 - normalized(y, h));
  }

  // Tous les paramètres FM pour une position (x, y) dans un canvas w x h, à l'instant
  // `seconds` de l'horloge (audio quand le son joue, sinon une horloge d'images).
  function modulationState(x, y, w, h, settings, seconds) {
    const nx = normalized(x, w);
    const ny = normalized(y, h);
    const carrier = carrierFrequency(x, w);
    const modulator = carrier * settings.ratio;
    const index = modulationIndex(y, h, settings.maxIndex);
    const vibratoPhase = 2 * Math.PI * VIBRATO_RATE * seconds;
    return {
      nx, ny,
      carrier, modulator, index,
      depth: settings.maxIndex > 0 ? index / settings.maxIndex : 0,   // indice dans [0, 1]
      deviation: index * modulator,                                   // écart de fréquence en Hz
      ratio: settings.ratio,
      vibrato: Math.sin(vibratoPhase),
      vibratoPhase,
      vibratoDeviation: carrier * VIBRATO_DEPTH,
      pan: 2 * nx - 1,
    };
  }

  // getContextClass et timers sont injectables pour tester sans navigateur
  function createEngine(getContextClass, timers = globalThis) {
    let context = null;
    let amplitude = null;
    let master = null;
    let carrier = null;
    let modulator = null;
    let modulatorGain = null;
    let vibratoGain = null;
    let panner = null;
    let startTime = 0;
    let running = false;
    let volume = INITIAL_VOLUME;

    function build() {
      const ContextClass = getContextClass();
      if (!ContextClass) return false;
      context = new ContextClass();
      master = context.createGain();
      master.gain.value = volume * MASTER_MAX;
      master.connect(context.destination);
      panner = context.createStereoPanner();
      panner.connect(master);
      amplitude = context.createGain();
      amplitude.gain.value = 0;
      amplitude.connect(panner);

      carrier = context.createOscillator();
      carrier.type = 'sine';
      carrier.connect(amplitude);

      modulator = context.createOscillator();
      modulator.type = 'sine';
      modulatorGain = context.createGain();
      modulatorGain.gain.value = 0;
      modulator.connect(modulatorGain);
      modulatorGain.connect(carrier.frequency);

      const vibrato = context.createOscillator();
      vibrato.type = 'sine';
      vibrato.frequency.value = VIBRATO_RATE;
      vibratoGain = context.createGain();
      vibratoGain.gain.value = 0;
      vibrato.connect(vibratoGain);
      vibratoGain.connect(carrier.frequency);

      startTime = context.currentTime;
      carrier.start();
      modulator.start();
      vibrato.start();
      return true;
    }

    function start() {
      if (!context && !build()) return false;
      context.resume();
      running = true;
      amplitude.gain.setTargetAtTime(AMPLITUDE, context.currentTime, FADE);
      return true;
    }

    function stop() {
      if (!running) return;
      running = false;
      amplitude.gain.setTargetAtTime(0, context.currentTime, FADE);
      // on suspend une fois le son retombé, sauf si le son a redémarré entre-temps
      timers.setTimeout(() => {
        if (!running) context.suspend();
      }, SUSPEND_DELAY_MS);
    }

    // Secondes écoulées depuis la création du contexte audio, ou null s'il n'existe pas :
    // c'est la phase exacte du vibrato du son (le LFO démarre à startTime).
    function clock() {
      return context ? context.currentTime - startTime : null;
    }

    function follow(param, value, now) {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, SMOOTHING);
    }

    // Applique un état FM (de modulationState) au son : la hauteur et le timbre suivent la position.
    function update(state) {
      if (!running) return;
      const now = context.currentTime;
      follow(carrier.frequency, state.carrier, now);
      follow(modulator.frequency, state.modulator, now);
      follow(modulatorGain.gain, state.deviation, now);
      follow(vibratoGain.gain, state.vibratoDeviation, now);
      follow(panner.pan, state.pan, now);
    }

    function setVolume(value) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new RangeError('Le volume doit être un nombre entre 0 et 1.');
      }
      volume = value;
      if (master) master.gain.setTargetAtTime(volume * MASTER_MAX, context.currentTime, FADE);
    }

    function bindCheckbox(checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          // sans API audio disponible, la case revient décochée
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

    return { start, stop, clock, update, setVolume, bindCheckbox, bindVolumeSlider,
      isRunning: () => running, getVolume: () => volume };
  }

  const engine = createEngine(() => globalThis.AudioContext || globalThis.webkitAudioContext);

  return { MIN_FREQUENCY, MAX_FREQUENCY, VIBRATO_RATE, VIBRATO_DEPTH, AMPLITUDE, MASTER_MAX,
    INITIAL_VOLUME, SUSPEND_DELAY_MS, PARAMETERS, createSettings, setParameter, bindSlider,
    carrierFrequency, modulationIndex, modulationState, createEngine, ...engine };
})();
