// Câblage p5 : lie les contrôles du menu aux modules (SnakeControls, DebugOptions, Scenarios,
// SkinPicker), crée le monde (SnakeWorld) et le menu du jeu (TextMenu), puis fait tourner la
// boucle draw. Les règles de pilotage sont dans les entités et les modules, pas ici.
const settings = SnakeControls.createSettings();
const debug = DebugOptions.create();
let world;
let menu;
// écrans de fin de partie (textToPoints), ouverts quand la partie est gagnée ou perdue
let winMenu;
let loseMenu;
let shownState = null;
let images;
let font;
let sceneCanvas;
let debugControls;
let scenarioControl;
let paused = false;
let pointerInside = false;
let hudTimer = 0;
let fps = 60;

const byId = id => document.getElementById(id);

// Le menu est une colonne à gauche : le canvas prend la largeur restante et toute la hauteur.
function sceneWidth() {
  const panel = byId('controls');
  return Math.max(1, windowWidth - (panel.hidden ? 0 : panel.offsetWidth));
}

function sceneHeight() {
  return Math.max(1, windowHeight);
}

// Règle un contrôle comme le ferait l'utilisateur : valeur, puis événement
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

function setPaused(value) {
  paused = value;
  byId('pause').textContent = paused ? '▶ Reprendre' : '⏸ Pause';
}

function preload() {
  font = loadFont('assets/inconsolata.otf');
}

// nouvelle partie : monde remis à zéro, écrans de fin refermés
function restart() {
  world.reset();
  winMenu.close();
  loseMenu.close();
}

// entrées des écrans de fin
function endAction(id) {
  if (id === 'replay') restart();
  else if (id === 'next') scenarioControl.next();
}

const GAME_STATUS = {
  free: () => 'Jeu libre — ajoutez un adversaire pour lancer une partie',
  playing: s => `Partie en cours — adversaires vaincus ${s.defeated} / ${s.rivalsTotal}`,
  won: s => `Victoire en ${Math.round(s.time)} s !`,
  lost: () => 'Game over — votre serpent a été dévoré',
};

// ouvre l'écran de fin quand la partie se termine
function watchGame() {
  const state = world.game.state;
  if (state === shownState) return;
  shownState = state;
  if (state === 'won') winMenu.open();
  if (state === 'lost') loseMenu.open();
  if (state === 'won' || state === 'lost') menu.close();
}

// entrées du menu du jeu (TextMenu) : chaque mot cliquable agit sur la partie
function menuAction(id) {
  if (id === 'play') {
    menu.close();
    // les lettres qui s'envolent laissent tomber quelques fruits
    for (const point of menu.samplePoints(5)) world.dropFood(point.x, point.y, 'pomme');
  } else if (id === 'scenario') {
    scenarioControl.next();
  } else if (id === 'add') {
    const max = SnakeControls.PARAMETERS.snakeCount.max;
    if (settings.snakeCount < max) sliderSetter('snake-snakeCount')(settings.snakeCount + 1);
    else world.burst(width / 2, height * 0.85, '#ffd27a', `Maximum : ${max} serpents`);
  } else if (id === 'rival') {
    const max = SnakeControls.PARAMETERS.rivals.max;
    if (settings.rivals < max) sliderSetter('snake-rivals')(settings.rivals + 1);
    else world.burst(width / 2, height * 0.85, '#ff4d4d', `Maximum : ${max} adversaires`);
  } else if (id === 'debug') {
    debugControls.toggle();
  }
}

function buildFoodLegend() {
  const list = byId('food-legend');
  for (const [kind, info] of Object.entries(Food.KINDS)) {
    const item = document.createElement('li');
    const image = document.createElement('img');
    image.src = Skins.dataUrl(Skins.foodSvg(kind));
    image.alt = '';
    const effect = info.boost ? `turbo ${info.boost} s` : `${info.grow > 0 ? '+' : '−'}${Math.abs(info.grow)} anneau${Math.abs(info.grow) > 1 ? 'x' : ''}`;
    item.append(image, Object.assign(document.createElement('b'), { textContent: info.label }), ` ${effect}`);
    list.appendChild(item);
  }
}

function canvasPoint(event) {
  const rect = sceneCanvas.elt.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
}

function setup() {
  sceneCanvas = createCanvas(sceneWidth(), sceneHeight());
  sceneCanvas.parent('scene');
  // chaque SVG est copié une fois dans un canvas bitmap (le redessiner en vectoriel coûte cher)
  const makeCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
  images = Skins.buildImages(Skins.spriteFactory(() => new Image(), makeCanvas));
  world = new SnakeWorld({ config: settings, width, height });

  // Réglages : chaque contrôle met à jour le même objet que world.config
  const applyWorld = () => world.applyConfig();
  for (const name of Object.keys(SnakeControls.PARAMETERS)) {
    const input = byId(`snake-${name}`);
    input.value = settings[name];
    SnakeControls.bindSlider(input, byId(`snake-${name}-value`), name, settings, applyWorld);
  }
  for (const name of Object.keys(SnakeControls.TOGGLES)) {
    SnakeControls.bindCheckbox(byId(`snake-${name}`), name, settings, applyWorld);
  }
  for (const name of Object.keys(SnakeControls.CHOICES)) {
    SnakeControls.bindChoice(byId(`snake-${name}`), name, settings, applyWorld);
  }
  SkinPicker.bind(byId('skin-gallery'), byId('snake-skin'));
  const showSkinName = () => { byId('skin-name').value = Skins.find(settings.skin).label; };
  byId('snake-skin').addEventListener('change', showSkinName);
  showSkinName();
  buildFoodLegend();

  // Debug : case générale (touche d) et calques
  const layers = {};
  for (const name of Object.keys(DebugOptions.LAYERS)) layers[name] = byId(`debug-${name}`);
  debugControls = DebugOptions.bind(debug, byId('debug-mode'), layers);

  // Menu du jeu dessiné avec textToPoints
  menu = new TextMenu({
    font,
    title: { label: 'SERPENTS', colors: ['#6ef0a0', '#3cf2ff'] },
    items: [
      { id: 'play', label: 'JOUER', color: '#ffd27a' },
      { id: 'scenario', label: 'SCÉNARIO SUIVANT', color: '#7aa7ff' },
      { id: 'add', label: 'AJOUTER UN SERPENT', color: '#ff9ecf' },
      { id: 'rival', label: 'AJOUTER UN ADVERSAIRE', color: '#ff6b6b' },
      { id: 'debug', label: 'DEBUG', color: '#b6f36b' },
    ],
    onSelect: menuAction,
  });
  menu.layout(width, height);
  const endItems = [
    { id: 'replay', label: 'REJOUER', color: '#ffd27a' },
    { id: 'next', label: 'SCÉNARIO SUIVANT', color: '#7aa7ff' },
  ];
  const endHint = () => {
    const s = world.summary();
    return `Temps ${Math.round(s.time)} s  ·  fruits mangés ${s.eaten}  ·  adversaires vaincus ${s.defeated} / ${s.rivalsTotal}  ·  touche « r » pour rejouer`;
  };
  winMenu = new TextMenu({ font, open: false, hint: endHint, onSelect: endAction, items: endItems,
    title: { label: 'VICTOIRE !', colors: ['#5ee37a', '#ffd27a'] } });
  loseMenu = new TextMenu({ font, open: false, hint: endHint, onSelect: endAction, items: endItems,
    title: { label: 'GAME OVER', colors: ['#ff4d4d', '#ff9ecf'] } });
  winMenu.layout(width, height);
  loseMenu.layout(width, height);

  byId('pause').addEventListener('click', () => setPaused(!paused));
  byId('reset').addEventListener('click', () => restart());
  byId('open-menu').addEventListener('click', () => menu.toggle());
  setPaused(false);

  MenuToggle.bind(byId('menu-toggle'), byId('controls'), () => windowResized());

  // Scénarios : liés en dernier, car le scénario par défaut règle tous les contrôles ci-dessus
  const setters = {};
  for (const name of Object.keys(SnakeControls.PARAMETERS)) setters[name] = sliderSetter(`snake-${name}`);
  for (const name of Object.keys(SnakeControls.TOGGLES)) setters[name] = checkboxSetter(`snake-${name}`);
  for (const name of Object.keys(SnakeControls.CHOICES)) setters[name] = selectSetter(`snake-${name}`);
  scenarioControl = Scenarios.bindSelect({
    select: byId('scenario'),
    description: byId('scenario-description'),
    controls: Object.keys(setters).map(name => byId(`snake-${name}`)),
    setters,
    onApply: () => restart(),
  });

  // Souris : les serpents la suivent, le menu réagit au survol, un clic nourrit ou choisit un mot
  const hint = byId('scene-hint');
  sceneCanvas.elt.addEventListener('pointermove', event => {
    const p = canvasPoint(event);
    pointerInside = true;
    world.setPointer(p.x, p.y);
    const hovered = [menu, winMenu, loseMenu].map(m => m.hover(p.x, p.y)).some(id => id !== null);
    sceneCanvas.elt.style.cursor = hovered ? 'pointer' : 'crosshair';
    if (!hint.dataset.timer) hint.dataset.timer = String(setTimeout(() => hint.classList.add('faded'), 5000));
  });
  sceneCanvas.elt.addEventListener('pointerleave', () => { pointerInside = false; });
  sceneCanvas.elt.addEventListener('pointerdown', event => {
    const p = canvasPoint(event);
    if (winMenu.click(p.x, p.y) || loseMenu.click(p.x, p.y) || menu.click(p.x, p.y)) return;
    if (!world.over) world.dropFood(p.x, p.y, settings.clickFood);
  });
}

function updateHud(dt) {
  if (dt > 0) fps += (1 / dt - fps) * 0.05;
  hudTimer -= dt;
  if (hudTimer > 0) return;
  hudTimer = 0.25;
  const s = world.summary();
  byId('stat-eaten').value = s.eaten;
  byId('stat-score').value = s.score;
  byId('stat-longest').value = s.longest;
  byId('stat-food').value = s.food;
  byId('stat-stolen').value = s.stolen;
  byId('stat-bites').value = s.bites;
  byId('stat-defeated').value = `${s.defeated} / ${s.rivalsTotal}`;
  byId('stat-time').value = `${Math.round(s.time)} s`;
  const status = byId('game-status');
  status.textContent = GAME_STATUS[s.state](s);
  status.dataset.state = s.state;
  byId('stat-rings').value = s.rings;
  byId('stat-fps').value = Math.round(fps);
}

function draw() {
  const dt = Math.min(SnakeWorld.MAX_DT, deltaTime / 1000);
  if (!paused) world.step(dt);
  watchGame();
  const pointer = pointerInside ? createVector(world.pointer.x, world.pointer.y) : null;
  for (const m of [menu, winMenu, loseMenu]) m.step(paused ? 0 : dt, pointer, world.threats());

  // le fond du terrarium est en CSS (#scene) : le canvas est seulement effacé (transparent)
  clear();
  menu.show(drawingContext, DebugOptions.visible(debug, 'menu'));
  world.show(images, drawingContext, debug);
  // les écrans de fin passent devant la scène figée
  for (const m of [winMenu, loseMenu]) {
    if (!m.visible) continue;
    drawingContext.fillStyle = `rgba(5, 8, 12, ${0.55 * m.alpha})`;
    drawingContext.fillRect(0, 0, width, height);
    m.show(drawingContext, DebugOptions.visible(debug, 'menu'));
  }
  updateHud(deltaTime / 1000);
}

function keyPressed() {
  if (key === 'd' || key === 'D') debugControls.toggle();
  else if (key === 'p' || key === 'P') setPaused(!paused);
  else if (key === 'r' || key === 'R') restart();
  else if (key === 'm' || key === 'M' || keyCode === ESCAPE) menu.toggle();
}

function windowResized() {
  resizeCanvas(sceneWidth(), sceneHeight());
  // p5 peut signaler un redimensionnement avant la fin de setup()
  if (!world) return;
  world.resize(width, height);
  for (const m of [menu, winMenu, loseMenu]) m.layout(width, height);
}
