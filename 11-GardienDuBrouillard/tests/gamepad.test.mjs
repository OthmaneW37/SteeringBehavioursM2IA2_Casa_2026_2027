import test from 'node:test';
import assert from 'node:assert/strict';
import { load, read, plain } from './helpers.mjs';

const { get } = load(19);
const Pad = get('Pad'), GamepadInput = get('GamepadInput'), Controls = get('Controls'), HumanController = get('HumanController'),
  Player = get('Player'), Arena = get('Arena'), Combat = get('Combat');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** Fausse manette (disposition standard) : `held` = noms des boutons enfoncés, `axes` = [x, y]. */
function fakePad(held = [], axes = [0, 0], extra = {}) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
  for (const name of held) buttons[Pad.BUTTONS[name]] = { pressed: true, value: 1 };
  for (const [name, v] of Object.entries(extra)) buttons[Pad.BUTTONS[name]] = { pressed: false, value: v };
  return { id: 'Manette de test (STANDARD GAMEPAD)', connected: true, buttons: buttons, axes: axes.concat([0, 0]) };
}

test('stick : zone morte radiale, puis montée continue jusqu\'à 1 (pas de saut)', () => {
  assert.deepEqual(plain(Pad.stick(0.1, 0.1)), { x: 0, y: 0 }, 'dans la zone morte');
  const edge = Pad.stick(Pad.DEADZONE + 1e-6, 0);
  assert.ok(edge.x > 0 && edge.x < 1e-4, 'juste après la zone morte : presque nul (continu)');
  assert.ok(close(Pad.stick(1, 0).x, 1), 'à fond : 1');
  const diag = Pad.stick(0.8, -0.8);
  assert.ok(close(Math.hypot(diag.x, diag.y), 1), 'diagonale à fond bornée à 1');
  assert.ok(diag.x > 0 && diag.y < 0, 'direction gardée');
  const mid = Pad.stick(0.6, 0);
  assert.ok(close(mid.x, (0.6 - Pad.DEADZONE) / (1 - Pad.DEADZONE)));
});

test('boutons : front montant seulement, gâchettes analogiques au-delà du seuil, croix, stick pour les menus', () => {
  const pad = new GamepadInput();
  assert.deepEqual(plain(pad.update(fakePad(['rb'])).pressed), ['rb']);
  assert.deepEqual(plain(pad.update(fakePad(['rb'])).pressed), [], 'tenu : pas de nouveau front');
  pad.update(fakePad([]));
  assert.deepEqual(plain(pad.update(fakePad(['rb'])).pressed), ['rb'], 'relâché puis enfoncé : nouveau front');
  const t = new GamepadInput();
  assert.deepEqual(plain(t.update(fakePad([], [0, 0], { rt: Pad.TRIGGER })).pressed), [], 'gâchette au seuil : pas encore');
  assert.deepEqual(plain(t.update(fakePad([], [0, 0], { rt: Pad.TRIGGER + 0.1 })).pressed), ['rt']);
  const d = new GamepadInput();
  const r = d.update(fakePad(['left', 'up'], [0.9, 0.9]));
  assert.deepEqual(plain(r.move), { x: -1, y: -1 }, 'la croix l\'emporte sur le stick');
  assert.equal(d.update(fakePad([], [0.05, 0])).move, null, 'au repos : pas de déplacement');
  const m = new GamepadInput();
  assert.ok(m.update(fakePad([], [0, -0.9])).pressed.includes('stickUp'));
  assert.ok(!m.update(fakePad([], [0, -0.9])).pressed.includes('stickUp'), 'tenu : une seule fois');
  assert.ok(m.update(fakePad([], [0, 0.9])).pressed.includes('stickDown'));
  // Débranchée : rien, et l'état est oublié
  const off = new GamepadInput();
  off.update(fakePad(['a']));
  assert.deepEqual(plain(off.update(null)), { connected: false, move: null, pressed: [] });
  assert.equal(off.id, null);
  assert.deepEqual(plain(off.update(fakePad(['a'])).pressed), ['a'], 'rebranchée, bouton tenu : compté une fois');
  assert.equal(GamepadInput.first([null, undefined, fakePad()]).connected, true);
  assert.equal(GamepadInput.first([]), null);
});

test('disposition Souls : chaque bouton déclenche la bonne action du chevalier', () => {
  assert.deepEqual(plain(Pad.ACTIONS), { rb: 'light', rt: 'heavy', lt: 'parry', b: 'roll', x: 'drink', r3: 'lock', y: 'lock' });
  const arena = new Arena(), p = new Player(400, 350);
  for (const [button, action] of Object.entries(Pad.ACTIONS)) {
    const h = new HumanController();
    const before = h.locked;
    assert.equal(h.trigger(action), true, button);
    if (action === 'lock') assert.equal(h.locked, !before, 'verrouillage basculé');
    else assert.equal(h.intent(p, null, arena, Combat.DT)[action], true, button + ' → ' + action);
  }
  assert.equal(new HumanController().trigger('danse'), false);
});

test('stick dans le contrôleur : déplacement analogique, le clavier garde la priorité', () => {
  const arena = new Arena(), p = new Player(400, 350);
  const h = new HumanController();
  h.setPadMove({ x: 0.5, y: -0.25 });
  assert.deepEqual(plain(h.intent(p, null, arena, Combat.DT).move), { x: 0.5, y: -0.25 });
  h.keyDown('d');
  assert.deepEqual(plain(h.intent(p, null, arena, Combat.DT).move), { x: 1, y: 0 }, 'une touche tenue l\'emporte');
  h.keyUp('d');
  h.setPadMove(null);
  assert.deepEqual(plain(h.intent(p, null, arena, Combat.DT).move), { x: 0, y: 0 });
  h.setPadMove({ x: 1, y: 0 });
  h.reset();
  assert.equal(h.padMove, null, 'remis à zéro');
});

test('choix du joueur : « clavier et manette » ou « clavier seulement », gardé sans plantage', () => {
  const data = {};
  const mem = { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  assert.equal(Controls.load(mem), 'auto');
  assert.equal(Controls.save(mem, 'clavier'), true);
  assert.equal(Controls.load(mem), 'clavier');
  data[Controls.KEY] = 'joystick';
  assert.equal(Controls.load(mem), 'auto', 'valeur inconnue : par défaut');
  assert.throws(() => Controls.save(mem, 'joystick'), { name: 'RangeError' });
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(Controls.load(blocked), 'auto');
  assert.equal(Controls.save(blocked, 'auto'), false);
  // Le câblage respecte le choix et ne lit la manette que s'il y en a une
  const src = read('sketch.js');
  assert.match(src, /if \(game\.controls === 'clavier' \|\| !navigator\.getGamepads\) return;/);
  assert.ok(read('index.html').includes('id="controlsSelect"'));
  // Les cartes du tutoriel ont toutes un texte pour la manette quand elles citent des touches
  for (const c of get('Tutorial').CARDS.slice(0, 5)) assert.ok(c.pad && c.pad.length > 30, c.title);
});
