import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { load, read, plain } from './helpers.mjs';

const { get } = load(21);
const ScreenFlow = get('ScreenFlow'), TitleMenu = get('TitleMenu'), Tutorial = get('Tutorial'), TutorialRun = get('TutorialRun'),
  HudLayout = get('HudLayout'), Banner = get('Banner');
const html = read('index.html');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
function memoryStorage() {
  const data = {};
  return { data, getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: k => { delete data[k]; } };
}

test('écrans : fondu au noir, changement au noir complet, durées exactes', () => {
  const F = ScreenFlow.FADE;
  const s = new ScreenFlow();
  assert.equal(s.current, 'title');
  assert.equal(s.alpha(), 0);
  assert.equal(s.go('title'), false, 'déjà sur cet écran');
  assert.equal(s.go('combat'), true);
  assert.equal(s.busy, true);
  assert.equal(s.update(F / 2), null);
  assert.ok(close(s.alpha(), 0.5), 'à mi-chemin du noir');
  assert.equal(s.current, 'title', 'pas encore changé');
  assert.deepEqual(plain(s.update(F / 2)), { from: 'title', to: 'combat' }, 'changement au noir complet');
  assert.equal(s.current, 'combat');
  assert.ok(close(s.alpha(), 1));
  s.update(F / 2);
  assert.ok(close(s.alpha(), 0.5), 'réapparition');
  s.update(F / 2);
  assert.equal(s.busy, false);
  assert.equal(s.alpha(), 0);
  assert.throws(() => s.go('options'), { name: 'RangeError' }, 'les Options sont une fenêtre, pas un écran');
  assert.throws(() => new ScreenFlow('inconnu'), { name: 'RangeError' });
});

test('écrans : le dernier ordre gagne, le fondu repart du noir atteint, un seul changement', () => {
  const F = ScreenFlow.FADE;
  const s = new ScreenFlow();
  s.go('combat');
  s.update(F * 0.4);
  s.go('lab');   // pendant l'assombrissement : la cible change, sans repartir de zéro
  assert.ok(close(s.alpha(), 0.4));
  const change = s.update(F * 0.6);
  assert.deepEqual(plain(change), { from: 'title', to: 'lab' }, 'jamais d\'écran intermédiaire');
  // Pendant la réapparition : on repart vers le noir depuis le niveau atteint
  s.update(F * 0.25);
  assert.ok(close(s.alpha(), 0.75));
  s.go('title');
  assert.ok(close(s.alpha(), 0.75), 'pas de saut');
  let changes = 0;
  for (let i = 0; i < 100; i++) if (s.update(F / 20)) changes++;
  assert.equal(changes, 1);
  assert.equal(s.current, 'title');
  assert.equal(s.busy, false);
  // Pendant la réapparition d'un écran, le redemander ne relance pas de fondu ; on peut déjà agir
  const r = new ScreenFlow();
  r.go('lab');
  r.update(F);
  r.update(F / 2);
  assert.equal(r.interactive, true, 'on agit pendant la réapparition');
  assert.equal(r.go('lab'), false);
  assert.equal(r.phase, 'in', 'pas de nouveau fondu');
  r.go('title');
  assert.equal(r.interactive, false, "pas pendant l'assombrissement");
  assert.equal(r.go('lab'), true, "revenir sur ses pas pendant l'assombrissement reste possible");
  // Un grand pas ne saute pas l'écran noir : le changement est signalé
  const t = new ScreenFlow();
  t.go('lab');
  assert.deepEqual(plain(t.update(10)), { from: 'title', to: 'lab' });
});

test('menu titre : navigation qui boucle, entrées inactives sautées, Continuer grisé sans partie', () => {
  const m = new TitleMenu();
  assert.deepEqual(plain(m.items.map(i => i.id)), ['new', 'continue', 'train', 'pantheon', 'lab', 'options']);
  assert.equal(m.current().id, 'new');
  m.setEnabled('continue', false);
  assert.equal(m.move(1), 'train', 'Continuer est sauté');
  assert.equal(m.move(-1), 'new');
  assert.equal(m.move(-1), 'options', 'le menu boucle vers le bas');
  assert.equal(m.move(1), 'new', 'et vers le haut');
  assert.equal(m.select('continue'), false, 'entrée inactive refusée');
  assert.equal(m.current().id, 'new');
  m.setEnabled('continue', true);
  assert.equal(m.move(1), 'continue');
  // L'entrée choisie devient inactive : on passe à la suivante active
  m.setEnabled('continue', false);
  assert.equal(m.current().id, 'train');
  assert.equal(m.select('options'), true);
  assert.equal(m.move(3), 'pantheon', 'trois entrées actives plus loin : options → new → train → pantheon');
  assert.throws(() => m.select('inconnu'), { name: 'RangeError' });
  const none = new TitleMenu([{ id: 'a', label: 'A', enabled: false }]);
  assert.equal(none.move(1), null, 'aucune entrée active');
});

test('tutoriel : cartes, progression, passer ; montré tant qu\'il n\'a pas été vu, stockage bloqué sans plantage', () => {
  assert.ok(Tutorial.CARDS.length >= 4);
  for (const c of Tutorial.CARDS) assert.ok(c.title.length > 3 && c.text.length > 30);
  const run = new TutorialRun();
  assert.equal(run.progress(), '1 / ' + Tutorial.CARDS.length);
  assert.equal(run.card().title, Tutorial.CARDS[0].title);
  run.next();
  assert.equal(run.card().title, Tutorial.CARDS[1].title);
  run.prev(); run.prev();
  assert.equal(run.index, 0, 'pas avant la première carte');
  for (let i = 0; i < Tutorial.CARDS.length; i++) run.next();
  assert.equal(run.done, true);
  assert.equal(run.card(), null);
  run.next();
  assert.equal(run.index, Tutorial.CARDS.length, 'pas au-delà de la fin');
  const skip = new TutorialRun();
  skip.skip();
  assert.equal(skip.done, true);
  // Mémorisation
  const mem = memoryStorage();
  assert.equal(Tutorial.shouldShow(mem), true);
  assert.equal(Tutorial.markSeen(mem), true);
  assert.equal(Tutorial.shouldShow(mem), false);
  const blocked = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('plein'); } };
  assert.equal(Tutorial.shouldShow(blocked), true);
  assert.equal(Tutorial.markSeen(blocked), false);
  assert.equal(Tutorial.shouldShow(null), true);
  assert.equal(Tutorial.markSeen(null), false);
});

test('HUD : tout reste dans l\'écran, rien ne se chevauche, tailles bornées', () => {
  const inside = (r, w, h, name) => {
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + (r.w || 0) <= w && r.y + (r.h || 0) <= h, `${name} hors de l'écran ${w}×${h} : ${JSON.stringify(r)}`);
  };
  for (const [w, h] of [[320, 240], [640, 480], [980, 720], [1280, 720], [1920, 1080], [3840, 2160]]) {
    const L = HudLayout.compute(w, h);
    for (const k of ['hp', 'stamina', 'boss']) inside(L[k], w, h, k);
    inside({ x: L.flasks.x, y: L.flasks.y, w: 5 * (L.flasks.size + L.flasks.gap), h: L.flasks.size }, w, h, 'fioles');
    assert.ok(L.stamina.y >= L.hp.y + L.hp.h, 'endurance sous la vie');
    assert.ok(L.flasks.y >= L.stamina.y + L.stamina.h, 'fioles sous l\'endurance');
    assert.ok(L.boss.y > L.flasks.y + L.flasks.size, 'barre du boss sous le HUD du joueur');
    assert.ok(close(L.boss.x + L.boss.w / 2, w / 2, 1), 'barre du boss centrée');
    assert.ok(L.hp.w <= 380 && L.boss.w <= 780, 'pas d\'étalement sur grand écran');
    assert.ok(L.hp.h >= 8 && L.hp.h <= 14);
  }
  // Grand écran : marges et barres plafonnées
  const big = HudLayout.compute(3840, 2160);
  assert.equal(big.margin, 32);
  assert.equal(big.hp.w, 380);
});

test('bandeaux : ouverture, texte, espacement croissant ; fondu au noir à la fin de la mort seulement', () => {
  const S = Banner.smoothstep;
  assert.equal(S(0, 1, -1), 0);
  assert.equal(S(0, 1, 2), 1);
  assert.ok(close(S(0, 1, 0.5), 0.5));
  assert.equal(S(1, 1, 1), 1, 'intervalle vide');
  const d0 = Banner.state('death', 0);
  assert.deepEqual(plain(d0), { band: 0, text: 0, spacing: 0.04, black: 0 });
  let prev = d0;
  for (let t = 0.1; t <= Banner.DURATION.death + 0.5; t += 0.1) {
    const s = Banner.state('death', t);
    for (const k of ['band', 'text', 'spacing', 'black']) assert.ok(s[k] >= prev[k] - 1e-12, `${k} ne recule pas (t = ${t.toFixed(1)})`);
    for (const k of ['band', 'text', 'black']) assert.ok(s[k] >= 0 && s[k] <= 1);
    prev = s;
  }
  assert.equal(Banner.state('death', 0.5).band, 1, 'bandeau ouvert en 0,5 s');
  assert.equal(Banner.state('death', Banner.DURATION.death - 1).black, 0, 'pas de noir avant la dernière seconde');
  assert.equal(Banner.state('death', Banner.DURATION.death).black, 1, 'noir complet à la réapparition');
  assert.equal(Banner.state('victory', 100).black, 0, 'la victoire ne passe pas au noir');
  assert.throws(() => Banner.state('pause', 1), { name: 'RangeError' });
});

test('page : menu titre, onglets du laboratoire et fenêtres présents ; polices locales et créditées', () => {
  const items = [...html.matchAll(/data-item="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(items, plain(TitleMenu.ITEMS.map(i => i.id)), 'un bouton par entrée du menu, dans l\'ordre');
  const tabs = [...html.matchAll(/data-mode="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(tabs, ['demo', 'training', 'comparison', 'pantheon']);
  for (const t of tabs) assert.ok(html.includes(`id="${t}Section"`), 'section ' + t);
  for (const id of ['titleScreen', 'pauseMenu', 'optionsScreen', 'tutorial', 'helpDialog']) assert.ok(html.includes(`id="${id}"`), id);
  for (const id of ['pauseMenu', 'optionsScreen', 'tutorial']) assert.match(html, new RegExp(`id="${id}" class="overlay" hidden`), id + ' caché au départ');
  assert.match(html, /<body class="screen-title">/, 'on arrive sur l\'écran titre');
  // Polices : fichiers locaux, licence jointe, déclarées dans le style, créditées
  const css = read('style.css');
  const credits = read('CREDITS.md');
  const fonts = readdirSync(new URL('../libraries/fonts/', import.meta.url));
  for (const f of fonts.filter(f => f.endsWith('.ttf'))) {
    assert.ok(css.includes('libraries/fonts/' + f), f + ' déclarée dans style.css');
    assert.ok(credits.includes(f), f + ' créditée');
  }
  for (const lic of ['OFL-UnifrakturMaguntia.txt', 'OFL-Cinzel.txt']) {
    assert.ok(fonts.includes(lic), lic + ' jointe');
    assert.ok(credits.includes(lic));
  }
  assert.ok(!/https?:\/\//.test(css), 'aucune ressource externe dans le style');
});
