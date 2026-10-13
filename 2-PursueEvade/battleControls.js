// Réglages du combat aérien et leur liaison aux contrôles du menu. Les réglages sont dans un
// objet simple, partagé avec AirBattle (battle.config) : après une modification,
// battle.applyConfig() les transmet aux chasseurs, à l'avion, aux missiles et aux leurres.
// Les éléments du DOM sont injectés, ce qui permet de tester sans navigateur.
const BattleControls = (() => {
  const PARAMETERS = {
    // chasseurs
    fighterCount: { min: 1, max: 8, step: 1, initial: 3, decimals: 0 },
    fighterSpeed: { min: 3, max: 12, step: 0.5, initial: 6.5, decimals: 1 },
    ammo: { min: 0, max: 8, step: 1, initial: 4, decimals: 0 },
    lockRange: { min: 100, max: 600, step: 10, initial: 380, decimals: 0 },
    lockTime: { min: 0.2, max: 3, step: 0.1, initial: 0.8, decimals: 1 },
    // avion rapide
    planeSpeed: { min: 3, max: 14, step: 0.5, initial: 7, decimals: 1 },
    detection: { min: 100, max: 500, step: 10, initial: 240, decimals: 0 },
    flareStock: { min: 0, max: 20, step: 1, initial: 6, decimals: 0 },
    flareTrigger: { min: 100, max: 400, step: 10, initial: 260, decimals: 0 },
    flareLife: { min: 1, max: 8, step: 0.5, initial: 3.5, decimals: 1 },
    flareHeat: { min: 0.5, max: 6, step: 0.5, initial: 3, decimals: 1 },
    // missiles
    missileSpeed: { min: 6, max: 20, step: 0.5, initial: 13, decimals: 1 },
    missileAgility: { min: 0.1, max: 3, step: 0.05, initial: 0.9, decimals: 2 },
    missileFuel: { min: 1, max: 10, step: 0.5, initial: 5, decimals: 1 },
    seekerAngle: { min: 20, max: 120, step: 5, initial: 70, decimals: 0 },
    // simulation
    timeScale: { min: 0.1, max: 2, step: 0.05, initial: 1, decimals: 2 },
  };
  const TOGGLES = { afterburner: true, missiles: true, flares: true };
  const CHOICES = {
    planeControl: { auto: 'Automatique', mouse: 'Souris (clic : leurre)' },
  };

  function createSettings() {
    const settings = {};
    for (const [name, range] of Object.entries(PARAMETERS)) settings[name] = range.initial;
    Object.assign(settings, TOGGLES);
    settings.planeControl = 'auto';
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
      onChange();
    };
    input.addEventListener('input', synchronize);
    synchronize();
  }

  function bindCheckbox(checkbox, name, settings, onChange = () => {}) {
    const synchronize = () => {
      setToggle(settings, name, Boolean(checkbox.checked));
      onChange();
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
      onChange();
    };
    select.addEventListener('change', synchronize);
    synchronize();
  }

  return { PARAMETERS, TOGGLES, CHOICES, createSettings, setParameter, setToggle, setChoice,
    bindSlider, bindCheckbox, bindChoice };
})();
