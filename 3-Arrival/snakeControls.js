// Réglages des serpents et de la nourriture, et leur liaison aux contrôles du menu. Les réglages
// sont dans un objet simple, partagé avec SnakeWorld (world.config) : après une modification,
// world.applyConfig() les transmet aux serpents. Les éléments du DOM sont injectés, ce qui permet
// de tester sans navigateur. Les options de debug sont à part (DebugOptions) : un scénario ne les
// touche pas.
const SnakeControls = (() => {
  const PARAMETERS = {
    // serpents
    snakeCount: { min: 1, max: 6, step: 1, initial: 1, decimals: 0 },
    length: { min: 3, max: 60, step: 1, initial: 18, decimals: 0 },
    size: { min: 6, max: 28, step: 1, initial: 14, decimals: 0 },
    // mouvement (arrive)
    speed: { min: 2, max: 14, step: 0.5, initial: 6, decimals: 1 },
    force: { min: 0.05, max: 1.5, step: 0.05, initial: 0.35, decimals: 2 },
    braking: { min: 20, max: 300, step: 10, initial: 120, decimals: 0 },
    spacing: { min: 4, max: 40, step: 1, initial: 14, decimals: 0 },
    // nourriture
    foodMax: { min: 0, max: 30, step: 1, initial: 8, decimals: 0 },
    foodRate: { min: 0, max: 5, step: 0.1, initial: 0.8, decimals: 1 },
    attraction: { min: 30, max: 300, step: 10, initial: 120, decimals: 0 },
    // adversaires (wander) : mêmes plages que l'exemple 4-Wander pour le cercle
    rivals: { min: 0, max: 3, step: 1, initial: 0, decimals: 0 },
    rivalSpeed: { min: 1, max: 10, step: 0.5, initial: 4, decimals: 1 },
    rivalHealth: { min: 1, max: 10, step: 1, initial: 4, decimals: 0 },
    wanderRadius: { min: 5, max: 100, step: 5, initial: 50, decimals: 0 },
    wanderDistance: { min: 10, max: 300, step: 10, initial: 150, decimals: 0 },
    wanderJitter: { min: 0.05, max: 1, step: 0.05, initial: 0.3, decimals: 2 },
  };
  const TOGGLES = { foodAuto: true };
  const CHOICES = {
    formation: {
      carrousel: 'Carrousel autour de la souris',
      conga: 'À la queue leu leu',
      chasse: 'Chasse à la nourriture',
    },
    skin: Object.fromEntries(Skins.LIST.map(skin => [skin.id, skin.label])),
    clickFood: { hasard: 'Au hasard', pomme: 'Pomme (+1)', etoile: 'Étoile (+3)', piment: 'Piment (turbo)', champignon: 'Champignon (−3)' },
  };
  const CHOICE_DEFAULTS = { formation: 'carrousel', skin: 'jade', clickFood: 'hasard' };

  function createSettings() {
    const settings = {};
    for (const [name, range] of Object.entries(PARAMETERS)) settings[name] = range.initial;
    Object.assign(settings, TOGGLES, CHOICE_DEFAULTS);
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

  function setToggle(settings, name, value) {
    if (!Object.hasOwn(TOGGLES, name)) throw new RangeError(`Option inconnue : ${name}.`);
    if (typeof value !== 'boolean') throw new TypeError(`${name} doit être un booléen.`);
    settings[name] = value;
  }

  function setChoice(settings, name, value) {
    const labels = CHOICES[name];
    if (!labels) throw new RangeError(`Choix inconnu : ${name}.`);
    if (!Object.hasOwn(labels, value)) throw new RangeError(`Valeur inconnue pour ${name} : ${value}.`);
    settings[name] = value;
  }

  function bindSlider(input, output, name, settings, onChange = () => {}) {
    const { decimals } = PARAMETERS[name];
    const synchronize = () => {
      setParameter(settings, name, Number(input.value));
      output.value = settings[name].toFixed(decimals);
      onChange(name);
    };
    input.addEventListener('input', synchronize);
    synchronize();
  }

  function bindCheckbox(checkbox, name, settings, onChange = () => {}) {
    const synchronize = () => {
      setToggle(settings, name, Boolean(checkbox.checked));
      onChange(name);
    };
    checkbox.addEventListener('change', synchronize);
    synchronize();
  }

  // makeOption(valeur, libellé) est injectable ; par défaut un vrai <option>
  function bindChoice(select, name, settings, onChange = () => {}, makeOption = (value, label) => new Option(label, value)) {
    for (const [value, label] of Object.entries(CHOICES[name])) select.appendChild(makeOption(value, label));
    select.value = settings[name];
    const synchronize = () => {
      setChoice(settings, name, select.value);
      onChange(name);
    };
    select.addEventListener('change', synchronize);
    synchronize();
  }

  return { PARAMETERS, TOGGLES, CHOICES, CHOICE_DEFAULTS, createSettings, setParameter, setToggle, setChoice,
    bindSlider, bindCheckbox, bindChoice };
})();
