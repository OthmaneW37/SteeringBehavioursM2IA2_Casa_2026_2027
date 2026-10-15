// Path Following (Complex Path)
// The Nature of Code
// The Coding Train / Daniel Shiffman
// https://youtu.be/LrnR6dc2IfM
// https://thecodingtrain.com/learning/nature-of-code/5.7-path-following.html

// Path Following: https://editor.p5js.org/codingtrain/sketches/dqM054vBV
// Complex Path: https://editor.p5js.org/codingtrain/sketches/2FFzvxwVt

// Crowd Path Following
// Via Reynolds: http://www.red3d.com/cwr/steer/CrowdPath.html

// Câblage p5 : crée le circuit (Circuit + TrackScenery, décor dessiné une fois dans une couche en
// cache), les insectes (InsectColony), les obstacles (ObstacleField) et les serpents (SnakeGroup),
// lie les contrôles du menu (SnakeSettings) et le menu masquable. Deux modes : « circuit » (on
// suit la route) et « arène » (pas de route : tout l'écran est un terrain bordé où l'on erre en
// contournant les obstacles). Les règles de pilotage sont dans vehicle.js (follow, separate,
// wander), steering.js (arrive, stayInside, avoid de 6-ObstacleAvoidance) et les classes Snake /
// SnakeRing / Insect.

// Pour debug on/off affichage des lignes etc. (lu aussi par Vehicle.follow)
let debug = false;

// le chemin que suivent les véhicules (la route du circuit)
let path;

// les insectes (véhicules ordinaires), les obstacles, les serpents et leurs réglages
let colony;
let obstacles;
let snakes;
// essaims d'insectes détectés à chaque image (affichage et statistiques)
let swarms = [];
const settings = SnakeSettings.createSettings();

// distance entre la bordure de l'arène et le bord du canvas
const ARENA_INSET = 24;

// couche hors écran qui contient le décor et la route, redessinée quand le circuit change
let sceneryLayer = null;
// faux pendant la liaison des contrôles : le circuit et les insectes sont créés ensuite, une fois
let ready = false;

const byId = id => document.getElementById(id);

const inArena = () => settings.mode === 'arene';

// règle un curseur comme le ferait l'utilisateur : valeur, puis événement
function setSlider(name, value) {
  const input = byId(`snake-${name}`);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function setup() {
  // plafond de densité de pixels : un grand écran très dense rendrait le fond trop lourd
  pixelDensity(Math.min(pixelDensity(), 2));
  // le canvas remplit toute la fenêtre
  createCanvas(windowWidth, windowHeight);
  colony = new InsectColony();
  snakes = new SnakeGroup(Math.random, { w: width, h: height });
  obstacles = new ObstacleField();

  // chaque contrôle met à jour le même objet settings, puis prévient le module concerné
  for (const name of Object.keys(SnakeSettings.PARAMETERS)) {
    SnakeSettings.bindSlider(byId(`snake-${name}`), byId(`snake-${name}-value`), name, settings, onSetting);
  }
  for (const name of Object.keys(SnakeSettings.TOGGLES)) SnakeSettings.bindToggle(byId(`snake-${name}`), name, settings, onSetting);
  for (const name of Object.keys(SnakeSettings.CHOICES)) SnakeSettings.bindChoice(byId(`snake-${name}`), name, settings, onSetting);

  // un autre circuit au hasard : on change le numéro du circuit comme le ferait l'utilisateur
  byId('new-circuit').addEventListener('click', () => setSlider('circuitSeed', Math.floor(random(SnakeSettings.PARAMETERS.circuitSeed.max + 1))));

  // vider les obstacles : posés à la main et réglés par le curseur
  byId('clear-obstacles').addEventListener('click', () => {
    setSlider('obstacleCount', 0);
    obstacles.clear();
  });

  // debug : la case et la touche d restent synchronisées
  byId('debug-mode').addEventListener('change', () => setDebug(byId('debug-mode').checked));

  // menu masquable
  MenuToggle.bind(byId('menu-toggle'), byId('controls'));

  // le circuit d'abord (les serpents partent de son premier point), puis insectes et premier serpent
  rebuildScenery();
  colony.resize(settings.insectCount, width, height, settings.insectSize);
  snakes.add(path.points[0].x, path.points[0].y, settings);
  ready = true;
}

// un réglage a changé : on le transmet au module qui l'utilise
function onSetting(name) {
  if (!ready) return;
  const groups = SnakeSettings.GROUPS;
  if (groups.mode.includes(name)) changeMode();
  else if (groups.circuit.includes(name)) rebuildScenery();
  else if (groups.insects.includes(name)) {
    colony.resize(settings.insectCount, width, height, settings.insectSize);
    colony.applySize(settings.insectSize);
  } else if (groups.obstacles.includes(name)) {
    obstacles.resize(settings.obstacleCount, width, height, settings.obstacleSize, settings.obstacleType, obstacleMargin());
    obstacles.applySize(settings.obstacleSize);
  } else if (groups.flock.includes(name)) {
    // lus à chaque image : rien à transmettre
  } else if (groups.dimensions.includes(name)) snakes.applyDimensions(settings);
  else if (groups.behavior.includes(name)) snakes.applySettings(settings);
}

// marge de placement des obstacles : loin du bord du canvas (et de la bordure de l'arène)
function obstacleMargin() {
  return ARENA_INSET + 70;
}

// changer de mode : décor adapté, puis curseurs réglés comme le ferait l'utilisateur
function changeMode() {
  rebuildScenery();
  const preset = SnakeSettings.MODE_PRESETS[settings.mode];
  for (const [name, value] of Object.entries(preset)) setSlider(name, value);
}

// nouveau fond : le circuit (points, route, décor) ou l'arène (sol, décor, bordure), dessiné dans
// la couche en cache. Le chemin (Path) est reconstruit dans les deux modes : il sert au mode circuit.
function rebuildScenery() {
  const built = Circuit.build(settings, width, height);
  path = new Path();
  path.radius = built.radius;
  for (const p of built.points) path.addPoint(p.x, p.y);

  const density = pixelDensity();
  sceneryLayer = sceneryLayer ?? document.createElement('canvas');
  sceneryLayer.width = Math.round(width * density);
  sceneryLayer.height = Math.round(height * density);
  const layerContext = sceneryLayer.getContext('2d');
  layerContext.setTransform(density, 0, 0, density, 0, 0);
  if (inArena()) {
    TrackScenery.renderArena(layerContext, { width, height, theme: settings.theme, seed: settings.circuitSeed, density: settings.decorDensity, inset: ARENA_INSET });
  } else {
    TrackScenery.render(layerContext, {
      width, height, points: built.points, roadRadius: built.radius,
      theme: settings.theme, seed: settings.circuitSeed, density: settings.decorDensity,
    });
  }
}

// la fenêtre change de taille : le canvas la suit, le décor est redessiné pour la nouvelle taille et
// les serpents gardent la nouvelle zone (les insectes y sont ramenés par leur garde-fou de bords)
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (!ready) return;
  snakes.bounds = { w: width, h: height };
  rebuildScenery();
}

function setDebug(enabled) {
  debug = enabled;
  Vehicle.debug = enabled;
  byId('debug-mode').checked = enabled;
}

function draw() {
  // le fond (décor + route ou arène) est déjà dessiné : on le recopie
  drawingContext.drawImage(sceneryLayer, 0, 0, width, height);
  if (debug && !inArena()) TrackScenery.drawCenterLine(drawingContext, path.points);
  const time = millis() / 1000;
  obstacles.show(drawingContext, time);
  // essaims : détectés avant le mouvement, halos sous les insectes
  swarms = settings.swarm ? Swarms.detect(colony.insects, 2 * settings.flockRadius) : [];
  Swarms.draw(drawingContext, swarms);

  // Chaque insecte s'écarte de tous les autres, y compris de la tête et des anneaux des serpents
  const vehicles = colony.insects;
  const circles = obstacles.colliders();
  const bounds = { w: width, h: height };
  const avoidConfig = Steering.avoidConfig(settings);
  const flockConfig = Steering.flockConfig(settings);
  const crowd = Crowd.forVehicles(vehicles, snakes.snakes);
  for (let v of vehicles) {
    if (inArena()) {
      // pas de circuit : l'insecte erre, se sépare, contourne les obstacles et reste dans l'arène
      v.applyFree(crowd, circles, bounds, avoidConfig);
    } else {
      // On applique les comportements pour suivre le chemin
      // Comme on utilise ici plusieurs comportements, notamment un comportement qui
      // dépend des autres véhicules, on passe en paramètre la foule et le chemin
      v.applyBehaviors(crowd, path);
      v.applyForce(v.avoidForce(circles, avoidConfig));
      v.applyForce(v.boundsForce(bounds));
    }
    // essaim : règles de boids avec les insectes de la même espèce ; peur des têtes de serpent
    if (settings.swarm) v.applyFlock(vehicles, flockConfig);
    if (settings.scareRadius > 0) v.applyForce(v.scareForce(snakes.snakes, settings.scareRadius));
    // on a regroupé update, draw etc. dans une méthode run (update, borders, display, etc.)
    v.run();
  }

  // Les serpents : la tête suit le chemin (sauf dans l'arène) et peut errer, tête et anneaux se
  // séparent des insectes et contournent les obstacles
  snakes.step(vehicles, inArena() ? null : path, circles);
  snakes.show(drawingContext, time);
  if (frameCount % 15 === 0) {
    const summary = Swarms.stats(swarms);
    byId('swarm-count').value = summary.count;
    byId('swarm-largest').value = summary.largest;
  }
  if (debug) {
    Swarms.drawDebug(drawingContext, swarms, 2 * settings.flockRadius);
    snakes.showDebug(drawingContext, vehicles, circles);
    obstacles.showDebug(drawingContext);
  }
}

// vrai si le focus est dans un champ où l'on tape (liste ou texte) : on n'intercepte pas la frappe
function typingInField() {
  const el = document.activeElement;
  return Boolean(el) && (el.tagName === 'SELECT' || el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(el.type)));
}

function keyPressed() {
  if (typingInField()) return;
  if (key == "d") {
    setDebug(!debug);
  } else if (key == "t") {
    // nouveau serpent sous la souris (ramené dans le canvas), design tiré au hasard
    snakes.add(constrain(mouseX, 0, width), constrain(mouseY, 0, height), settings);
  } else if (key == "o") {
    // nouvel obstacle sous la souris, du type et de la taille choisis dans le menu
    obstacles.add(constrain(mouseX, 0, width), constrain(mouseY, 0, height), settings.obstacleType, settings.obstacleSize);
  } else if (key == "s") {
    // une abeille rapide
    colony.add(mouseX, mouseY, { species: 'abeille', maxSpeed: 5 });
  } else if (key == "w") {
    // une grosse sauterelle qui erre : elle ne suit pas le chemin et ne se sépare de personne
    const v = colony.add(mouseX, mouseY, { species: 'sauterelle', maxSpeed: 2, size: 22 });
    v.wanderWeight = 1;
    v.followPathWeight = 0;
    v.separateWeight = 0;
  }
}

// clic sur la scène (si l'interrupteur est actif) : on retire l'obstacle cliqué, sinon on en pose un
// du type et de la taille choisis dans le menu, en circuit comme en arène
function mousePressed(event) {
  if (!settings.clickObstacle) return;
  if (event && event.target && event.target.tagName !== 'CANVAS') return;
  if (!obstacles.removeAt(mouseX, mouseY)) obstacles.add(mouseX, mouseY, settings.obstacleType, settings.obstacleSize);
}

function mouseDragged(event) {
  // glisser un curseur du menu ne doit pas créer d'insectes, ni glisser en posant des obstacles
  if (settings.clickObstacle) return;
  if (event && event.target && event.target.tagName !== 'CANVAS') return;
  colony.add(mouseX, mouseY);
}
