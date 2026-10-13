// Réglages des cibles et leur liaison aux contrôles du menu : type (normale ou fuyante),
// mouvement, diamètre, taille aléatoire, vitesse, agilité, et pour la cible fuyante :
// rayon de détection, endurance, reproduction et délai de division. Les réglages sont dans un
// objet simple ; applyTo les transmet à une cible. Les éléments du DOM sont injectés, ce qui
// permet de tester sans navigateur.
const TargetControls = (() => {
  const PARAMETERS = {
    diameter: { min: 20, max: 200, step: 2, initial: 100, decimals: 0 },     // diamètre du cercle
    speed: { min: 0, max: 12, step: 0.5, initial: 4, decimals: 1 },          // vitesse max normale
    force: { min: 0, max: 5, step: 0.05, initial: 0.3, decimals: 2 },        // agilité (force max)
    detection: { min: 50, max: 300, step: 10, initial: 200, decimals: 0 },   // cercle de détection
    endurance: { min: 0.5, max: 10, step: 0.5, initial: 2.5, decimals: 1 },  // fuite max, en secondes
    splitAfter: { min: 1, max: 10, step: 0.5, initial: 3, decimals: 1 },     // fuite avant division
  };
  const CHOICES = {
    motion: { wander: 'Se déplace seule', cursor: 'Suit le curseur' },
    kind: { target: 'Normale (Target)', fleeing: 'Fuyante (TargetFuyante)' },
  };
  const TOGGLES = ['randomSize', 'reproduction'];

  function createSettings() {
    const settings = {};
    for (const [name, range] of Object.entries(PARAMETERS)) settings[name] = range.initial;
    settings.randomSize = true;      // true : la Target fournie change son rayon au hasard
    settings.reproduction = false;   // true : une cible fuyante se divise après avoir fui
    settings.motion = 'wander';
    settings.kind = 'target';
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
    if (!TOGGLES.includes(name)) throw new RangeError(`Option inconnue : ${name}.`);
    if (typeof value !== 'boolean') throw new TypeError(`${name} doit être un booléen.`);
    settings[name] = value;
  }

  function setChoice(settings, name, value) {
    const labels = CHOICES[name];
    if (!labels) throw new RangeError(`Choix inconnu : ${name}.`);
    if (!Object.hasOwn(labels, value)) throw new RangeError(`Valeur inconnue pour ${name} : ${value}.`);
    settings[name] = value;
  }

  // Transmet les réglages à une cible (le type de cible est géré par TargetGroup).
  function applyTo(target, settings) {
    target.fixedRadius = settings.randomSize ? null : settings.diameter / 2;
    target.maxSpeed = settings.speed;
    target.maxForce = settings.force;
    target.setMotion(settings.motion);
    if (typeof target.configureFlight === 'function') {
      target.configureFlight({
        detection: settings.detection,
        endurance: settings.endurance,
        reproduction: settings.reproduction,
        splitAfter: settings.splitAfter,
      });
    }
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

  return { PARAMETERS, CHOICES, TOGGLES, createSettings, setParameter, setToggle, setChoice,
    applyTo, bindSlider, bindCheckbox, bindChoice };
})();
