import test from 'node:test';
import assert from 'node:assert/strict';
import { load, read, plain, lcg, FILES } from './helpers.mjs';

const { get } = load(5);
const html = read('index.html');
const Settings = get('Settings'), Scenarios = get('Scenarios');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('chaque identifiant utilisé par sketch.js existe dans index.html', () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  const sketch = read('sketch.js');
  const used = new Set([...sketch.matchAll(/byId\('([^']+)'\)/g)].map(m => m[1]));
  used.add('canvasHolder');
  for (const name in Settings.PARAMETERS) { used.add(name); used.add(name + 'Val'); }
  assert.ok(used.size > 30);
  for (const id of used) assert.ok(ids.has(id), `#${id} manque dans index.html`);
});

test('curseurs : mêmes min / max / step / value que Settings.PARAMETERS, texte affiché cohérent', () => {
  const sliders = [...html.matchAll(/<input type="range" id="([^"]+)" min="([^"]+)" max="([^"]+)" step="([^"]+)" value="([^"]+)">/g)];
  assert.equal(sliders.length, Object.keys(Settings.PARAMETERS).length);
  for (const [, id, min, max, step, value] of sliders) {
    const p = Settings.PARAMETERS[id];
    assert.ok(p, id);
    assert.equal(Number(min), p.min, id + ' min');
    assert.equal(Number(max), p.max, id + ' max');
    assert.equal(Number(step), p.step, id + ' step');
    assert.equal(Number(value), p.initial, id + ' value');
    const shown = new RegExp(`id="${id}Val">([^<]*)<`).exec(html)[1];
    assert.equal(shown, Settings.format(id, p.initial), id + ' affichage');
  }
});

test('scripts chargés dans l\'ordre des dépendances, p5 en local, sketch.js en dernier', () => {
  // Le numéro de version (?v=…) force le navigateur à recharger les scripts après une mise à jour
  const raw = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  const versions = new Set(raw.filter(s => !s.startsWith('libraries/')).map(s => s.split('?v=')[1]));
  assert.equal(versions.size, 1, 'une seule version pour tous les scripts');
  assert.ok(!versions.has(undefined), 'chaque script a un numéro de version');
  const scripts = raw.map(s => s.split('?')[0]);
  assert.equal(scripts[0], 'libraries/p5.min.js');
  assert.deepEqual(scripts.slice(1), FILES.concat(['sketch.js']));
  assert.ok(!/https?:\/\//.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'aucune ressource externe');
});

test('réglages : valeurs hors plage refusées', () => {
  for (const [name, p] of Object.entries(Settings.PARAMETERS)) {
    assert.equal(Settings.check(name, p.initial), p.initial);
    for (const bad of [p.min - 1, p.max + 1, NaN, '1', undefined]) {
      assert.throws(() => Settings.check(name, bad), { name: 'RangeError' }, `${name} = ${bad}`);
    }
  }
  assert.throws(() => Settings.check('populationSize', 55.5), { name: 'RangeError' });
  assert.throws(() => Settings.validate({ ...Settings.defaults(), elites: 9 }), { name: 'RangeError' });
});

test('scénarios : dans les plages des curseurs, « Personnalisé » sinon, appliqués à de vrais objets', () => {
  const Training = get('Training'), Fight = get('Fight'), Arena = get('Arena'), HandBossController = get('HandBossController'),
    ScriptedPlayerController = get('ScriptedPlayerController'), seededRandom = get('seededRandom');
  assert.equal(Scenarios.LIST[0].id, 'reference');
  assert.deepEqual(plain(Scenarios.LIST[0].changes), {});
  for (const sc of Scenarios.LIST) {
    const s = Scenarios.settings(sc.id);
    for (const [k, v] of Object.entries(s)) {
      const p = Settings.PARAMETERS[k];
      assert.ok(v >= p.min && v <= p.max, `${sc.id}.${k}`);
      assert.ok(close(Math.round((v - p.min) / p.step) * p.step + p.min, v, 1e-9), `${sc.id}.${k} sur un cran du curseur`);
    }
    assert.ok(sc.label.length > 0 && sc.description.length > 20);
    assert.equal(Scenarios.matching(s), sc.id);
    // Appliqué à de vrais objets
    const t = new Training(s, { seed: 2 });
    assert.equal(t.population.length, s.populationSize);
    const f = new Fight({ arena: new Arena(), playerController: new ScriptedPlayerController(seededRandom(1), s),
      bossController: new HandBossController(), maxTime: s.maxFightTime, detectRadius: s.detectRadius, seed: 1 });
    assert.equal(f.boss.detectRadius, s.detectRadius);
    assert.equal(f.playerController.dodgeProbability, s.dodgeProbability);
  }
  assert.equal(Scenarios.matching({ ...Settings.defaults(), mutationRate: 0.27 }), 'personnalise');
  assert.throws(() => Scenarios.get('inconnu'), { name: 'RangeError' });
});

test('clavier : déplacements, actions gardées en tampon, verrouillage', () => {
  const HumanController = get('HumanController'), Player = get('Player'), Combat = get('Combat');
  const h = new HumanController();
  const p = new Player(100, 100);
  h.keyDown('Z'); h.keyDown('d');
  let it = h.intent(p, null, null, Combat.DT);
  assert.deepEqual(plain(it.move), { x: 1, y: -1 });
  h.keyUp('z');
  assert.deepEqual(plain(h.intent(p, null, null, Combat.DT).move), { x: 1, y: 0 });
  h.keyDown('arrowleft');
  assert.equal(h.intent(p, null, null, Combat.DT).move.x, 0);
  // Verrouillage : bascule
  assert.equal(h.locked, true);
  h.keyDown('l');
  assert.equal(h.intent(p, null, null, Combat.DT).lock, false);
  // Action pendant une attaque : gardée BUFFER secondes puis jouée
  p.action = Combat.newAttack('light', 0);
  h.keyDown(' ');
  assert.equal(h.intent(p, null, null, 0.1).roll, false);
  p.action = null;
  assert.equal(h.intent(p, null, null, 0.1).roll, true, 'jouée dès que possible');
  assert.equal(h.intent(p, null, null, 0.1).roll, false, 'une seule fois');
  p.action = Combat.newAttack('light', 0);
  h.keyDown('j');
  h.intent(p, null, null, 0.2);
  h.intent(p, null, null, 0.1);
  p.action = null;
  assert.equal(h.intent(p, null, null, 0.1).light, false, 'tampon expiré après 0,25 s');
  assert.equal(h.keyDown('x'), false, 'touche inconnue ignorée');
});

test('caméra : arène entière sans verrouillage, rapprochée et bornée à l\'arène en verrouillage', () => {
  const Camera = get('Camera'), Arena = get('Arena'), Player = get('Player'), Boss = get('Boss');
  const arena = new Arena();
  const free = Camera.target(arena, 1000, 700, false);
  assert.deepEqual(plain(free), { scale: 1, cx: 500, cy: 350 });
  const p = new Player(100, 100), b = new Boss(200, 120);
  const t = Camera.target(arena, 1000, 700, true, p, b);
  assert.ok(close(t.scale, Camera.LOCK_ZOOM));
  const halfW = 1000 / t.scale / 2, halfH = 700 / t.scale / 2;
  assert.ok(t.cx - halfW >= -1e-9 && t.cy - halfH >= -1e-9, 'la vue ne sort pas de l\'arène');
  const mid = Camera.target(arena, 1000, 700, true, new Player(480, 340), new Boss(520, 360));
  assert.ok(close(mid.cx, 500) && close(mid.cy, 350));
  const cam = new Camera();
  cam.snap(free);
  cam.follow(t, 10);
  assert.ok(close(cam.scale, t.scale, 1e-6), 'rejoint la cible');
});

test('courbes : lissage, sous-échantillonnage, points dans le cadre, séries de l\'historique', () => {
  const FitnessChart = get('FitnessChart'), Hud = get('Hud');
  assert.deepEqual(plain(FitnessChart.smooth([2, 4, 6, 8], 2)), [2, 3, 5, 7]);
  assert.deepEqual(plain(FitnessChart.smooth([5], 10)), [5]);
  const long = Array.from({ length: 1000 }, (_, i) => i);
  const ds = FitnessChart.downsample(long, 300);
  assert.equal(ds.length, 300);
  assert.equal(ds[0], 0);
  assert.equal(ds[299], 999, 'la dernière génération est toujours montrée');
  assert.deepEqual(plain(FitnessChart.downsample([1, 2, 3], 300)), [1, 2, 3]);
  const pts = FitnessChart.points([0, 50, 100, 150], 200, 100, 0, 100);
  assert.deepEqual(plain(pts.map(q => q.x)), [0, 200 / 3, 400 / 3, 200]);
  assert.deepEqual(plain(pts.map(q => q.y)), [100, 50, 0, 0], 'valeur hors échelle bornée au cadre');
  assert.equal(FitnessChart.points([7], 100, 50, 7, 7)[0].x, 50);
  const history = Array.from({ length: 1200 }, (_, g) => ({ generation: g, best: g % 7, mean: -3 + (g % 5), winRate: (g % 10) / 10, championWinRate: Math.min(0.6, g / 1000) }));
  const sr = FitnessChart.series(history);
  assert.equal(sr.champion.length, FitnessChart.MAX_POINTS);
  assert.equal(sr.mean.length, FitnessChart.MAX_POINTS);
  assert.ok(Math.abs(sr.champion[sr.champion.length - 1] - 60) < 1e-9, 'en pourcentage');
  assert.ok(sr.min <= sr.max);
  assert.deepEqual(plain(FitnessChart.series([])).champion, []);
  assert.equal(Hud.fill(50, 100, 200), 100);
  assert.equal(Hud.fill(-5, 100, 200), 0);
  assert.equal(Hud.fill(150, 100, 200), 200);
  assert.ok(Hud.CONTROLS.length >= 4);
});

test('panneau de debug : entrées et sorties lues sans recalcul, géométrie du wander identique à vehicle.js', () => {
  const DebugPanel = get('DebugPanel'), BossBrain = get('BossBrain'), NeuralBossController = get('NeuralBossController'),
    Boss = get('Boss'), Player = get('Player'), Arena = get('Arena');
  const ctrl = new NeuralBossController(BossBrain.create(lcg(1)));
  const b = new Boss(500, 350), pl = new Player(400, 350);
  assert.equal(DebugPanel.rows(ctrl, b).length, 0, 'rien avant la première décision');
  ctrl.decide(b, pl, new Arena());
  const rows = DebugPanel.rows(ctrl, b);
  assert.equal(rows.length, 17);
  assert.equal(rows.filter(r => r.group === 'sortie').length, 5);
  assert.equal(rows[12].threshold, 0.5, 'déplacement : seuil 0,5');
  assert.equal(rows[13].threshold, 0.6);
  assert.match(DebugPanel.state(b, ctrl), /décision/);
  // Errance : même point vert que wander() de vehicle.js
  b.wandering = false;
  assert.equal(DebugPanel.wanderGeometry(b), null);
  b.wandering = true;
  b.vel.set(0, 2);
  b.wanderTheta = 0.4;
  const geo = DebugPanel.wanderGeometry(b);
  assert.ok(close(geo.center.x, 500) && close(geo.center.y, 350 + b.distanceCercle));
  const theta = 0.4 + Math.PI / 2;
  assert.ok(close(geo.target.x, 500 + b.wanderRadius * Math.cos(theta)) && close(geo.target.y, 350 + b.distanceCercle + b.wanderRadius * Math.sin(theta)));
});

test('bouton du menu : masque et réaffiche le menu', () => {
  const MenuToggle = get('MenuToggle');
  const classes = new Set();
  const doc = { body: { classList: { toggle: c => (classes.has(c) ? (classes.delete(c), false) : (classes.add(c), true)) } } };
  const button = { textContent: '', setAttribute(k, v) { this[k] = v; } };
  assert.equal(MenuToggle.toggle(doc, button), true);
  assert.equal(button['aria-expanded'], 'false');
  assert.match(button.textContent, /Menu/);
  assert.equal(MenuToggle.toggle(doc, button), false);
  assert.equal(button['aria-expanded'], 'true');
});

test('boss pré-entraîné : architecture 12-16-5 et équilibre avec le joueur robot (ni 0 %, ni 100 %)', () => {
  const PRETRAINED_BOSS = get('PRETRAINED_BOSS'), NeuralNetwork = get('NeuralNetwork'), Comparison = get('Comparison'),
    NeuralBossController = get('NeuralBossController'), HandBossController = get('HandBossController');
  const brain = NeuralNetwork.fromJSON(PRETRAINED_BOSS.brain);
  assert.deepEqual(plain(brain.sizes), [12, 16, 5]);
  assert.ok(PRETRAINED_BOSS.history.length === PRETRAINED_BOSS.generations);
  const c = new Comparison([
    { name: 'Boss à états', makeController: () => new HandBossController() },
    { name: 'Boss appris', makeController: () => new NeuralBossController(brain) }
  ], Settings.defaults(), 20, 777);
  for (let guard = 0; !c.done && guard < 100; guard++) c.work(1e6);
  const [hand, learned] = c.summary();
  assert.ok(learned.winRate >= 0.3 && learned.winRate <= 0.8, 'boss appris : ' + learned.winRate);
  assert.ok(learned.winRate > hand.winRate, 'le boss appris fait mieux que le boss à états');
});
