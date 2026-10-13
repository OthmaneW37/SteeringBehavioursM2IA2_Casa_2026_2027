const vehicles = [];
const settings = SeekPopulation.createSettings();
const targetSettings = TargetControls.createSettings();
const gradientSettings = GradientBackground.createSettings();
const gradientState = GradientBackground.createState();
const fmSettings = FMSynth.createSettings();
// les cibles : une seule, sauf quand les cibles fuyantes se reproduisent
let targets;
let sceneCanvas;
// dernière position du curseur dans le canvas : le centre du dégradé la suit
const pointer = { x: 0, y: 0 };
// nombre de fois où un vaisseau a atteint une cible depuis le dernier changement de scénario
let captures = 0;
let capturesOutput;
let targetsOutput;
let debugCheckbox;

const byId = id => document.getElementById(id);

// Le menu est une colonne à gauche : le canvas prend la largeur restante et toute la hauteur.
function sceneWidth() {
  const menu = byId('controls');
  return Math.max(1, windowWidth - (menu.hidden ? 0 : menu.offsetWidth));
}

function sceneHeight() {
  return Math.max(1, windowHeight);
}

// Règle un contrôle du menu comme le ferait l'utilisateur : la valeur change, puis l'événement
// est déclenché pour que les liaisons existantes mettent à jour les véhicules et les cibles.
function sliderSetter(id) {
  return value => {
    const input = byId(id);
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };
}

function checkboxSetter(id) {
  return value => {
    const input = byId(id);
    input.checked = value;
    input.dispatchEvent(new Event('change'));
  };
}

function selectSetter(id) {
  return value => {
    const input = byId(id);
    input.value = value;
    input.dispatchEvent(new Event('change'));
  };
}

// une cible normale (PointTarget) ou fuyante (TargetFuyante), qui fuit les véhicules
function makeTarget(kind, x, y) {
  const target = kind === 'fleeing' ? new TargetFuyante(x, y) : new PointTarget(x, y);
  target.threats = vehicles;
  return target;
}

// mode debug : cercle de détection des cibles fuyantes (touche « d » ou case du menu)
function setDebug(enabled) {
  TargetFuyante.debug = enabled;
  debugCheckbox.checked = enabled;
}

function setup() {
  sceneCanvas = createCanvas(sceneWidth(), sceneHeight());
  sceneCanvas.parent('scene');
  targets = TargetGroup.create({
    make: makeTarget,
    configure: target => TargetControls.applyTo(target, targetSettings),
  });
  targets.reset(width / 2, height / 2);
  pointer.x = width / 2;
  pointer.y = height / 2;
  capturesOutput = byId('captures');
  targetsOutput = byId('targets-count');
  debugCheckbox = byId('debug-mode');
  debugCheckbox.addEventListener('change', () => setDebug(debugCheckbox.checked));

  // Les réglages des véhicules sont liés avant la population : les véhicules créés par le
  // slider de population reprennent donc les valeurs courantes.
  const vehicleSliders = { maxSpeed: 'max-speed', maxForce: 'max-force', fleeRadius: 'flee-radius' };
  for (const [name, id] of Object.entries(vehicleSliders)) {
    const input = byId(id);
    input.value = settings[name];
    SeekPopulation.bindParameterSlider(input, byId(`${id}-value`), name, vehicles, settings);
  }
  SeekPopulation.bindFleeCheckbox(byId('flee-mode'), vehicles, settings);

  // Bouton pour afficher ou masquer le menu : le canvas reprend la place libérée.
  MenuToggle.bind(byId('menu-toggle'), byId('controls'), () => windowResized());

  // Réglages des cibles : type, mouvement, diamètre, taille aléatoire, vitesse, agilité,
  // détection, endurance, reproduction
  const applyTargets = () => {
    targets.setKind(targetSettings.kind);
    targets.configureAll();
  };
  TargetControls.bindChoice(byId('target-kind'), 'kind', targetSettings, applyTargets);
  TargetControls.bindChoice(byId('target-motion'), 'motion', targetSettings, applyTargets);
  const targetSliders = {
    diameter: 'target-diameter', speed: 'target-speed', force: 'target-force',
    detection: 'target-detection', endurance: 'target-endurance', splitAfter: 'target-split',
  };
  for (const [name, id] of Object.entries(targetSliders)) {
    const input = byId(id);
    input.value = targetSettings[name];
    TargetControls.bindSlider(input, byId(`${id}-value`), name, targetSettings, applyTargets);
  }
  TargetControls.bindCheckbox(byId('random-size'), 'randomSize', targetSettings, applyTargets);
  TargetControls.bindCheckbox(byId('reproduction'), 'reproduction', targetSettings, applyTargets);

  // Réglages du dégradé psychédélique
  for (const name of Object.keys(GradientBackground.PARAMETERS)) {
    const id = `gradient-${name}`;
    const input = byId(id);
    input.value = gradientSettings[name];
    GradientBackground.bindSlider(input, byId(`${id}-value`), name, gradientSettings);
  }

  // Réglages du son FM
  for (const name of Object.keys(FMSynth.PARAMETERS)) {
    const id = `fm-${name}`;
    const input = byId(id);
    input.value = fmSettings[name];
    FMSynth.bindSlider(input, byId(`${id}-value`), name, fmSettings);
  }
  FMSynth.bindVolumeSlider(byId('fm-volume'), byId('fm-volume-value'));

  // Le son ne démarre qu'au clic sur la case (le navigateur l'exige).
  FMSynth.bindCheckbox(byId('fm-sound'));

  // la population évite d'apparaître sur la première cible
  const primaryTarget = { get pos() { return targets.primary().pos; }, get r() { return targets.primary().r; } };
  const slider = byId('vehicle-count');
  slider.value = SeekPopulation.INITIAL_COUNT;
  SeekPopulation.bindSlider(slider, byId('vehicle-count-value'),
    vehicles, primaryTarget, () => ({ width, height }), (x, y) => {
      const vehicle = new Follower(x, y);
      SeekPopulation.applySettings(vehicle, settings);
      return vehicle;
    });

  // Scénarios : liés en dernier, car le scénario par défaut règle tous les contrôles ci-dessus.
  // Toucher ensuite à l'un de ces réglages à la main passe le menu sur « Personnalisé ».
  const scenarioControls = ['flee-mode', 'target-kind', 'target-motion', 'random-size',
    'target-diameter', 'target-speed', 'target-force', 'target-detection', 'target-endurance',
    'reproduction', 'target-split', 'flee-radius', 'max-speed', 'max-force'];
  Scenarios.bindSelect({
    select: byId('scenario'),
    description: byId('scenario-description'),
    controls: scenarioControls.map(byId),
    setters: {
      fleeing: checkboxSetter('flee-mode'),
      targetKind: selectSetter('target-kind'),
      targetMotion: selectSetter('target-motion'),
      randomSize: checkboxSetter('random-size'),
      diameter: sliderSetter('target-diameter'),
      targetSpeed: sliderSetter('target-speed'),
      targetForce: sliderSetter('target-force'),
      detection: sliderSetter('target-detection'),
      endurance: sliderSetter('target-endurance'),
      reproduction: checkboxSetter('reproduction'),
      splitAfter: sliderSetter('target-split'),
      fleeRadius: sliderSetter('flee-radius'),
      maxSpeed: sliderSetter('max-speed'),
      maxForce: sliderSetter('max-force'),
    },
    // un nouveau scénario repart d'une seule cible au centre et d'un compteur à zéro
    onApply: () => {
      targets.reset(width / 2, height / 2);
      captures = 0;
      capturesOutput.value = captures;
    },
  });

  // Coordonnées relatives au canvas : manipuler les contrôles ne déplace jamais la cible.
  sceneCanvas.elt.addEventListener('pointermove', event => {
    const rect = sceneCanvas.elt.getBoundingClientRect();
    const x = (event.clientX - rect.left) * width / rect.width;
    const y = (event.clientY - rect.top) * height / rect.height;
    if (x >= 0 && x <= width && y >= 0 && y <= height) {
      pointer.x = x;
      pointer.y = y;
    }
    targets.primary().follow(x, y, width, height);
  });
}

function draw() {
  // Les cibles se déplacent (seules, en fuyant les véhicules, ou sous le curseur), se divisent
  // si elles le peuvent, puis réapparaissent du côté opposé quand elles sortent du canvas.
  targets.update(TargetFuyante.frameSeconds());
  targets.edges();

  // La position de la première cible règle la modulation de fréquence : le son et le dégradé
  // lisent le même état FM. Avec le son, l'horloge est celle de l'audio.
  const primary = targets.primary();
  const seconds = FMSynth.isRunning() ? FMSynth.clock() : frameCount / 60;
  const fm = FMSynth.modulationState(primary.pos.x, primary.pos.y, width, height, fmSettings, seconds);
  FMSynth.update(fm);
  GradientBackground.step(gradientState, gradientSettings, fm, GradientBackground.focusFrom(pointer, width, height));
  GradientBackground.draw(gradientState, gradientSettings, width, height);

  // chaque véhicule poursuit (ou fuit) la cible la plus proche ; une cible capturée disparaît
  // s'il en reste d'autres
  let captured = false;
  for (const vehicle of vehicles) {
    const target = targets.nearest(vehicle);
    if (SeekPopulation.step(vehicle, target, width, height)) {
      captures++;
      captured = true;
      targets.capture(target);
    }
    vehicle.show();
  }
  if (captured) capturesOutput.value = captures;
  targetsOutput.value = targets.targets.length;

  // le cercle pointillé montre la distance de fuite des véhicules quand ils fuient
  for (const target of targets.targets) target.zoneRadius = settings.fleeing ? settings.fleeRadius : 0;
  targets.show();
}

function keyPressed() {
  if (key === 'd' || key === 'D') setDebug(!TargetFuyante.debug);
}

function windowResized() {
  resizeCanvas(sceneWidth(), sceneHeight());
  for (const target of targets.targets) {
    target.pos.set(constrain(target.pos.x, 0, width), constrain(target.pos.y, 0, height));
  }
  pointer.x = constrain(pointer.x, 0, width);
  pointer.y = constrain(pointer.y, 0, height);
  for (const vehicle of vehicles) vehicle.edges();
}
