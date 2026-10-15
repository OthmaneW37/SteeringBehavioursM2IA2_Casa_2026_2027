// Réglages de l'exemple et leur liaison aux contrôles du menu : curseurs (PARAMETERS), interrupteur
// (TOGGLES) et listes de choix (CHOICES). Les réglages sont dans un objet simple ; le sketch
// transmet chaque modification au module concerné (serpents, circuit, insectes), selon GROUPS.
// Valeurs initiales : celles de Vehicle pour les poids (followPathWeight = 2, separateWeight = 1.2).
// Les éléments du DOM sont injectés, ce qui permet de tester sans navigateur.
const SnakeSettings = (() => {
  const PARAMETERS = {
    // comportements des serpents (poids des forces de la tête)
    followWeight: { min: 0, max: 5, step: 0.1, initial: 2, decimals: 1 },
    separateWeight: { min: 0, max: 5, step: 0.1, initial: 1.2, decimals: 1 },
    wanderWeight: { min: 0, max: 3, step: 0.1, initial: 0, decimals: 1 },
    wanderRadius: { min: 10, max: 100, step: 5, initial: 40, decimals: 0 },
    avoidWeight: { min: 0, max: 5, step: 0.1, initial: 3, decimals: 1 },
    avoidRays: { min: 3, max: 9, step: 2, initial: 5, decimals: 0 },
    avoidFan: { min: 10, max: 80, step: 5, initial: 40, decimals: 0 },
    // dimensions des serpents (les valeurs aléatoires de la touche t restent dans SnakeSkins.RANGES)
    snakeSize: { min: 6, max: 24, step: 1, initial: 14, decimals: 0 },
    snakeLength: { min: 5, max: 40, step: 1, initial: 14, decimals: 0 },
    snakeSpeed: { min: 1, max: 4, step: 0.1, initial: 2.5, decimals: 1 },
    // circuit
    circuitSize: { min: 40, max: 100, step: 5, initial: 90, decimals: 0 },
    circuitSegments: { min: 12, max: 60, step: 1, initial: 30, decimals: 0 },
    circuitIrregularity: { min: 0, max: 1, step: 0.05, initial: 0.5, decimals: 2 },
    roadWidth: { min: 10, max: 45, step: 1, initial: 20, decimals: 0 },
    circuitSeed: { min: 0, max: 999, step: 1, initial: 7, decimals: 0 },
    decorDensity: { min: 0, max: 100, step: 5, initial: 60, decimals: 0 },
    // obstacles (évités avec l'algorithme de 6-ObstacleAvoidance)
    obstacleCount: { min: 0, max: 20, step: 1, initial: 0, decimals: 0 },
    obstacleSize: { min: 10, max: 60, step: 1, initial: 28, decimals: 0 },
    // essaims d'insectes (boids de 7-Boids) : poids des trois règles, rayon de perception, peur
    flockAlign: { min: 0, max: 2, step: 0.1, initial: 1.5, decimals: 1 },
    flockCohesion: { min: 0, max: 2, step: 0.1, initial: 1, decimals: 1 },
    flockSeparation: { min: 0, max: 15, step: 0.1, initial: 3, decimals: 1 },
    flockRadius: { min: 15, max: 100, step: 1, initial: 40, decimals: 0 },
    scareRadius: { min: 0, max: 200, step: 10, initial: 90, decimals: 0 },
    // insectes
    insectCount: { min: 0, max: 40, step: 1, initial: 20, decimals: 0 },
    insectSize: { min: 6, max: 24, step: 1, initial: 12, decimals: 0 },
  };
  // randomSizes : la touche t tire taille, longueur et vitesse au hasard (dans SnakeSkins.RANGES)
  // clickObstacle : un clic sur la scène pose (ou retire) un obstacle au lieu de créer des insectes
  // swarm : les insectes d'une même espèce se déplacent en essaim (alignement, cohésion, séparation)
  const TOGGLES = { randomSizes: true, clickObstacle: false, swarm: true };
  const CHOICES = {
    shape: Object.fromEntries(Object.entries(Circuit.SHAPES).map(([id, shape]) => [id, shape.label])),
    theme: Object.fromEntries(Object.entries(TrackScenery.THEMES).map(([id, theme]) => [id, theme.label])),
    snakePattern: { hasard: 'Au hasard', ...SnakeSkins.PATTERN_LABELS },
    mode: { circuit: 'Circuit', arene: 'Arène (sans circuit)' },
    avoidMode: { classique: 'Classique (6-ObstacleAvoidance)', rayons: 'Multi-rayons (prédiction)' },
    obstacleType: { hasard: 'Au hasard', ...Object.fromEntries(Object.entries(Obstacle.TYPES).map(([id, type]) => [id, type.label])) },
  };
  const CHOICE_DEFAULTS = { shape: 'cercle', theme: 'prairie', snakePattern: 'hasard', mode: 'circuit', obstacleType: 'hasard', avoidMode: 'classique' };
  // changer de mode règle d'un coup ces curseurs (comme le ferait l'utilisateur) ; on peut ensuite
  // les modifier à la main. Arène : les créatures errent et il y a des obstacles ; circuit : retour au suivi.
  const MODE_PRESETS = {
    circuit: { wanderWeight: 0, obstacleCount: 0 },
    arene: { wanderWeight: 1, obstacleCount: 6 },
  };

  // quel module reçoit quel réglage
  const GROUPS = {
    behavior: ['followWeight', 'separateWeight', 'wanderWeight', 'wanderRadius', 'avoidWeight', 'avoidRays', 'avoidFan'],
    mode: ['mode'],
    obstacles: ['obstacleCount', 'obstacleSize'],
    dimensions: ['snakeSize', 'snakeLength', 'snakeSpeed'],
    circuit: ['circuitSize', 'circuitSegments', 'circuitIrregularity', 'roadWidth', 'circuitSeed', 'decorDensity', 'shape', 'theme'],
    insects: ['insectCount', 'insectSize'],
    // lus à chaque image par le sketch : rien à transmettre
    flock: ['flockAlign', 'flockCohesion', 'flockSeparation', 'flockRadius', 'scareRadius'],
  };

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

  // curseur → réglage → affichage de la valeur, puis onChange(nom)
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

  function bindToggle(checkbox, name, settings, onChange = () => {}) {
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

  return { PARAMETERS, TOGGLES, CHOICES, CHOICE_DEFAULTS, MODE_PRESETS, GROUPS, createSettings, setParameter, setToggle, setChoice,
    bindSlider, bindToggle, bindChoice };
})();
