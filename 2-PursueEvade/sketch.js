// Câblage p5 : lie les contrôles du menu aux modules (BattleControls, Scenarios, FlightSounds)
// et fait tourner le combat (AirBattle). Les règles sont dans les modules, pas ici.
const settings = BattleControls.createSettings();
let battle;
let sceneCanvas;
let debugMode = false;
let planeStateOutput;
let levelOutput;
const statOutputs = {};
let shownStats = '';

const byId = id => document.getElementById(id);

// libellés de l'état de l'avion affichés dans le menu
const PLANE_STATES = {
  cruise: 'croisière', evading: 'évasion', breaking: 'dégagement', piloted: 'piloté', destroyed: 'abattu',
};

function sceneHeight() {
  return Math.max(1, windowHeight - byId('controls').offsetHeight);
}

// Règle un contrôle du menu comme le ferait l'utilisateur : la valeur change, puis l'événement
// est déclenché pour que les liaisons existantes mettent à jour le combat.
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

function setDebug(enabled) {
  debugMode = enabled;
  byId('debug-mode').checked = enabled;
}

function setPaused(paused) {
  battle.paused = paused;
  byId('pause').textContent = paused ? '▶ Reprendre (p)' : '⏸ Pause (p)';
  byId('step').disabled = !paused;
}

function setup() {
  sceneCanvas = createCanvas(windowWidth, sceneHeight());
  sceneCanvas.parent('scene');
  battle = new AirBattle({ config: settings });
  FlightSounds.attach(battle);
  planeStateOutput = byId('plane-state');
  levelOutput = byId('sound-level');
  for (const name of ['kills', 'shots', 'decoyed', 'flares', 'expired']) statOutputs[name] = byId(`stat-${name}`);

  // Réglages du combat : chaque contrôle met à jour le même objet que battle.config
  const applyBattle = () => battle.applyConfig(settings);
  for (const name of Object.keys(BattleControls.PARAMETERS)) {
    const id = `battle-${name}`;
    const input = byId(id);
    input.value = settings[name];
    BattleControls.bindSlider(input, byId(`${id}-value`), name, settings, applyBattle);
  }
  for (const name of Object.keys(BattleControls.TOGGLES)) {
    BattleControls.bindCheckbox(byId(`battle-${name}`), name, settings, applyBattle);
  }
  for (const name of Object.keys(BattleControls.CHOICES)) {
    BattleControls.bindChoice(byId(`battle-${name}`), name, settings, applyBattle);
  }

  // Sons : ils ne démarrent qu'au clic sur la case (le navigateur l'exige)
  FlightSounds.bindCheckbox(byId('sound'));
  FlightSounds.bindVolumeSlider(byId('sound-volume'), byId('sound-volume-value'));

  // Debug, pause et pas à pas
  byId('debug-mode').addEventListener('change', () => setDebug(byId('debug-mode').checked));
  byId('pause').addEventListener('click', () => setPaused(!battle.paused));
  byId('step').addEventListener('click', () => battle.stepOnce());
  setPaused(false);

  // Bouton pour afficher ou masquer le menu : le canvas reprend la place libérée
  MenuToggle.bind(byId('menu-toggle'), byId('controls'), () => windowResized());

  // Scénarios : liés en dernier, car le scénario par défaut règle tous les contrôles ci-dessus.
  // Toucher ensuite à l'un de ces réglages à la main passe le menu sur « Personnalisé ».
  const setters = {};
  for (const name of Object.keys(BattleControls.PARAMETERS)) setters[name] = sliderSetter(`battle-${name}`);
  for (const name of Object.keys(BattleControls.TOGGLES)) setters[name] = checkboxSetter(`battle-${name}`);
  for (const name of Object.keys(BattleControls.CHOICES)) setters[name] = selectSetter(`battle-${name}`);
  Scenarios.bindSelect({
    select: byId('scenario'),
    description: byId('scenario-description'),
    controls: Object.keys(setters).map(name => byId(`battle-${name}`)),
    setters,
    // un nouveau scénario repart d'un combat neuf
    onApply: () => battle.reset(),
  });

  // Pilotage : la souris dirige l'avion, un clic lâche un leurre (scénario « Vous pilotez l'avion »)
  sceneCanvas.elt.addEventListener('pointermove', event => {
    const rect = sceneCanvas.elt.getBoundingClientRect();
    battle.pilotTo((event.clientX - rect.left) * width / rect.width, (event.clientY - rect.top) * height / rect.height);
  });
  sceneCanvas.elt.addEventListener('pointerdown', () => battle.pilotFlare());
}

// ciel : dégradé vertical, plus clair vers l'horizon
function drawSky() {
  const gradient = drawingContext.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#08102a');
  gradient.addColorStop(1, '#1f3560');
  drawingContext.fillStyle = gradient;
  drawingContext.fillRect(0, 0, width, height);
}

// compteurs du menu, mis à jour seulement quand ils changent
function updateHud() {
  const stats = battle.stats;
  const key = `${stats.kills}|${stats.shots}|${stats.decoyed}|${stats.flares}|${stats.expired}`;
  if (key !== shownStats) {
    shownStats = key;
    for (const name of Object.keys(statOutputs)) statOutputs[name].value = stats[name];
  }
  planeStateOutput.value = PLANE_STATES[battle.plane.state] ?? battle.plane.state;
  levelOutput.value = `${Math.round(FlightSounds.level() * 100)} %`;
}

function draw() {
  // temps réel en secondes, converti en pas de simulation fixes (échelle de temps du menu)
  battle.advance(deltaTime / 1000);
  FlightSounds.update(battle.soundState());

  drawSky();
  push();
  // tremblement d'écran quand l'avion est abattu
  if (battle.shake > 0) translate(random(-1, 1) * battle.shake * 10, random(-1, 1) * battle.shake * 10);
  battle.show({ debug: debugMode });
  pop();
  updateHud();
}

function keyPressed() {
  if (key === 'd' || key === 'D') setDebug(!debugMode);
  else if (key === 'p' || key === 'P') setPaused(!battle.paused);
  else if (key === ' ') {
    battle.pilotFlare();
    return false;
  }
  return undefined;
}

function windowResized() {
  resizeCanvas(windowWidth, sceneHeight());
}
