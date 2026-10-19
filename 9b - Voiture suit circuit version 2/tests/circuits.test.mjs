import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRandom, plain } from './helpers.mjs';

const { get } = load();
const Circuits = get('Circuits');
const TrackGeometry = get('TrackGeometry');
const CircuitCurriculum = get('CircuitCurriculum');

const dataCircuits = Circuits.LIST.filter(c => c.points);
const killers = Circuits.LIST.filter(c => c.kind === 'tueur');
const mid = s => [(s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2];

test('catalogue : identifiants uniques, au moins 4 circuits tueurs nommés et décrits', () => {
  const ids = Circuits.ids();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(killers.length >= 4);
  for (const c of Circuits.LIST) {
    assert.ok(c.name.length > 0 && c.description.length > 10, c.id);
    assert.ok(['genere', 'standard', 'tueur'].includes(c.kind));
  }
  for (const key in Circuits.SETS) Circuits.SETS[key].ids.forEach(id => assert.ok(ids.includes(id)));
  assert.deepEqual(plain(Circuits.SETS.tueurs.ids).sort(), plain(killers.map(c => c.id)).sort());
  assert.throws(() => Circuits.get('inexistant'), { name: 'RangeError' });
});

for (const def of dataCircuits) {
  test(`circuit « ${def.name} » : points dans le canvas, boucle fermée, checkpoints ordonnés, murs sans croisement`, () => {
    const W = Circuits.REFERENCE.width, H = Circuits.REFERENCE.height;
    // Points de contrôle et largeur locale dans le canvas de référence
    for (const p of def.points) {
      const half = (p.length > 2 ? p[2] : 1) * def.width / 2;
      assert.ok(p[0] - half >= 0 && p[0] + half <= W && p[1] - half >= 0 && p[1] + half <= H, `${def.id} : ${p}`);
    }

    for (const [w, h] of [[W, H], [1600, 900], [700, 500]]) {
      const t = Circuits.build(def, w, h);
      // Tous les points construits (murs, tracé) sont dans le canvas
      for (const p of t.inner.concat(t.outer, t.center)) {
        assert.ok(p[0] >= 0 && p[0] <= w && p[1] >= 0 && p[1] <= h, `${def.id} hors canvas ${w}×${h} : ${p}`);
      }
      // Boucle fermée : le dernier point est aussi proche du premier que deux points voisins
      const n = t.center.length;
      const gap = Math.hypot(t.center[n - 1][0] - t.center[0][0], t.center[n - 1][1] - t.center[0][1]);
      const step = Math.hypot(t.center[1][0] - t.center[0][0], t.center[1][1] - t.center[0][1]);
      assert.ok(Math.abs(gap - step) < 0.05 * step + 0.5, `${def.id} : boucle ouverte (${gap} / ${step})`);
      // Murs : autant de segments que de points, fermés
      assert.equal(t.walls.length, 2 * n);
      assert.deepEqual(plain(t.walls[t.walls.length - 1].b), plain(t.walls[1].a));
    }

    const t = Circuits.build(def, W, H);
    // Checkpoints ordonnés : un tous les CP_STEP points, espacements réguliers, le dernier ramène au premier
    assert.equal(t.center.length % TrackGeometry.CP_STEP, 0, 'nombre de points multiple de CP_STEP');
    assert.equal(t.checkpoints.length, t.center.length / TrackGeometry.CP_STEP);
    const spacing = TrackGeometry.CP_STEP * TrackGeometry.SPACING * t.scale;
    for (let k = 0; k < t.checkpoints.length; k++) {
      const a = mid(t.checkpoints[k]), b = mid(t.checkpoints[(k + 1) % t.checkpoints.length]);
      const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      assert.ok(d > 0.5 * spacing && d < 1.5 * spacing, `${def.id} : checkpoints ${k}→${k + 1} distants de ${d.toFixed(1)}`);
      // Chaque checkpoint coupe la piste à l'index de tracé correspondant
      const c = t.center[k * TrackGeometry.CP_STEP];
      assert.ok(Math.hypot(a[0] - c[0], a[1] - c[1]) < 1, `${def.id} : checkpoint ${k} hors du tracé`);
    }
    // Départ : le prochain checkpoint est le premier situé après la ligne de départ
    const startIdx = Math.floor(t.center.length * 0.05);
    const k = t.start.checkpointIndex;
    assert.ok(k * TrackGeometry.CP_STEP > startIdx && (k - 1) * TrackGeometry.CP_STEP <= startIdx);
    assert.ok(Math.hypot(mid(t.checkpoints[k])[0] - t.start.x, mid(t.checkpoints[k])[1] - t.start.y) <= spacing * 1.5);
    // Les murs ne se croisent pas (épingles sans repli, goulets sans contact)
    assert.equal(TrackGeometry.wallCrossings(t), 0, `${def.id} : murs qui se croisent`);
  });
}

test('validation sensible : un circuit qui se replie est détecté', () => {
  // Épingle de rayon 15 avec une piste de 70 : le mur intérieur se replie
  const pts = [[100, 100], [600, 100], [615, 115], [600, 130], [100, 130]];
  const t = TrackGeometry.build(TrackGeometry.fromControlPoints(pts), 1000, 700, { width: 70, normalSpan: 3 });
  assert.ok(TrackGeometry.wallCrossings(t) > 0);
});

test('circuit généré : même graine ⇒ même circuit, boucle fermée et murs cohérents', () => {
  const g1 = TrackGeometry.generate(1000, 700, 100, 5, seededRandom(42));
  const g2 = TrackGeometry.generate(1000, 700, 100, 5, seededRandom(42));
  assert.deepEqual(plain(g1.center), plain(g2.center));
  const t = TrackGeometry.build(g1.center, 1000, 700, { width: 100, tiles: g1.tiles });
  assert.equal(t.walls.length, 2 * t.center.length);
  assert.ok(t.checkpoints.length > 10);
  assert.ok(t.scale <= 1, 'le circuit généré n\'est jamais agrandi (comportement d\'origine)');
  for (const p of t.inner.concat(t.outer)) assert.ok(p[0] >= 0 && p[0] <= 1000 && p[1] >= 0 && p[1] <= 700);
});

test('curriculum : passage uniquement après un tour complet', () => {
  const c = new CircuitCurriculum(['a', 'b', 'c']);
  assert.equal(c.current(), 'a');
  assert.equal(c.afterGeneration(0), false);
  assert.equal(c.current(), 'a', 'aucun tour : on reste');
  assert.equal(c.passed, 0);
  assert.equal(c.afterGeneration(1), true);
  assert.equal(c.current(), 'b');
  assert.equal(c.passed, 1);
  assert.equal(c.afterGeneration(0), false);
  assert.equal(c.current(), 'b');
});

test('curriculum : retour au début de la liste et record de tours par circuit', () => {
  const c = new CircuitCurriculum(['a', 'b']);
  c.afterGeneration(2);
  assert.equal(c.lapsOnAllCircuits(), 0, 'b n\'a jamais été bouclé');
  c.afterGeneration(1);
  assert.equal(c.current(), 'a', 'fin de liste : retour au premier circuit');
  assert.equal(c.loops, 1);
  assert.equal(c.passed, 2);
  assert.equal(c.lapsOnAllCircuits(), 1);
  assert.equal(c.bestLaps.a, 2);
  // Un record n'est jamais abaissé
  c.afterGeneration(0);
  assert.equal(c.bestLaps.a, 2);
});

test('curriculum : un seul circuit ⇒ pas de changement (comportement d\'origine)', () => {
  const c = new CircuitCurriculum(['genere']);
  assert.equal(c.afterGeneration(1), false);
  assert.equal(c.current(), 'genere');
  assert.equal(c.passed, 1);
  assert.throws(() => new CircuitCurriculum([]), { name: 'RangeError' });
});

test('préréglages de circuits : correspondance et « personnalisé »', () => {
  assert.equal(Circuits.setFor(['genere']), 'genere');
  assert.equal(Circuits.setFor(Circuits.SETS.tueurs.ids.slice()), 'tueurs');
  assert.equal(Circuits.setFor(['ovale', 'goulets']), 'personnalise');
});
