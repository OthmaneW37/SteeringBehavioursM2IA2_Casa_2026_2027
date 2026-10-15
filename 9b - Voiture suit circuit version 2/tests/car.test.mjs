import test from 'node:test';
import assert from 'node:assert/strict';
import { load, seededRandom, plain, Vector } from './helpers.mjs';

function setup(seed = 12345) {
  const env = load(seed);
  const g = env.get;
  const Circuits = g('Circuits');
  const buildWorld = id => {
    const t = Circuits.build(Circuits.get(id), 1000, 700);
    return { walls: t.walls, checkpoints: t.checkpoints, width: 1000, height: 700, start: t.start };
  };
  return {
    ...env, buildWorld,
    Car: g('Car'), CarTypes: g('CarTypes'), NeuralNetwork: g('NeuralNetwork'), Settings: g('Settings'),
    Trainer: g('Trainer'), Race: g('Race'), Circuits,
  };
}
const START = { x: 500, y: 350, angle: 0, checkpointIndex: 0 };
const finite = v => Number.isFinite(v.x) && Number.isFinite(v.y);

test('Berline : valeurs identiques aux constantes d\'origine', () => {
  const { CarTypes, Car } = setup();
  const b = CarTypes.get('berline');
  assert.equal(CarTypes.DEFAULT, 'berline');
  assert.equal(b.speedFactor, 1);
  assert.equal(b.maxForce, 0.5);
  assert.equal(b.maxTurn, 0.5);
  assert.equal(b.mass, 1);
  assert.equal(b.grip, 1);
  assert.equal(b.width, 10);
  assert.equal(b.height, 20);
  assert.equal(b.sightDist, 150);
  assert.equal(b.fov, Math.PI / 1.5);
  const car = new Car(null, { start: START });
  assert.equal(car.type.id, 'berline');
  assert.deepEqual(plain(car.brain.sizes), [8, 20, 2]);
  assert.equal(car.maxSpeed(), 6, 'GAME_SPEED_LIMIT par défaut');
});

test('Berline : force de pilotage identique à la formule d\'origine', () => {
  const { Car } = setup();
  // Formule de la version d'origine (Car.think) recopiée ici comme référence
  const original = (o, vel, frame) => {
    const map = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
    const turn = map(o[0], 0, 1, -0.5, 0.5);
    let thrust = map(o[1], 0, 1, 0, 6);
    if (frame < 30) thrust = Math.max(thrust, 3);
    const desired = Vector.fromAngle(vel.heading() + turn).setMag(thrust);
    return Vector.sub(desired, vel).limit(0.5);
  };
  for (const [o, vx, vy, frame] of [[[0.5, 1], 3, 0, 50], [[0, 0.2], 1, 2, 50], [[1, 0.9], -4, 1, 10], [[0.3, 0], 6, 0, 100]]) {
    const car = new Car(null, { start: START });
    car.vel.set(vx, vy);
    car.frameCount = frame;
    car.steerFromOutputs(o);
    const ref = original(o, new Vector(vx, vy), frame);
    assert.ok(Math.abs(car.acc.x - ref.x) < 1e-12 && Math.abs(car.acc.y - ref.y) < 1e-12, `${o}`);
    assert.equal(car.braking, false);
  }
});

test('types : la vitesse max dépend réellement du type', () => {
  const { Car, CarTypes } = setup();
  for (const type of CarTypes.LIST) {
    const car = new Car(null, { start: START, type });
    for (let i = 0; i < 300; i++) {
      car.steerFromOutputs([0.5, 1]);
      car.update();
      car.dead = false; // on ignore l'anti-blocage : seule la physique est testée
    }
    const vmax = type.speedFactor * 6;
    assert.ok(Math.abs(car.vel.mag() - vmax) < 1e-6, `${type.id} : ${car.vel.mag()} au lieu de ${vmax}`);
  }
  assert.ok(CarTypes.get('sportive').speedFactor > CarTypes.get('berline').speedFactor);
  assert.ok(CarTypes.get('camion').speedFactor < CarTypes.get('berline').speedFactor);
});

test('types : le freinage appliqué vaut la décélération du type', () => {
  const { Car, CarTypes } = setup();
  for (const type of CarTypes.LIST) {
    const car = new Car(null, { start: START, type });
    car.vel.set(4, 0);
    car.frameCount = 100;
    car.steerFromOutputs([0.5, 1, 0.9]); // tout droit, frein actif
    assert.equal(car.braking, true);
    car.update();
    assert.ok(Math.abs(car.vel.mag() - (4 - type.brakeDecel)) < 1e-9, `${type.id} : ${car.vel.mag()}`);
  }
  // Le camion freine plus fort que la sportive
  assert.ok(CarTypes.get('camion').brakeDecel > 3 * CarTypes.get('sportive').brakeDecel);
});

test('frein : sous le seuil ou sans 3e sortie, aucun freinage', () => {
  const { Car, CarTypes } = setup();
  const car = new Car(null, { start: START });
  car.vel.set(4, 0);
  car.frameCount = 100;
  car.steerFromOutputs([0.5, 4 / 6, CarTypes.BRAKE_THRESHOLD]); // seuil exact : pas de frein (> strict)
  assert.equal(car.braking, false);
  car.update();
  assert.ok(Math.abs(car.vel.mag() - 4) < 1e-9, 'poussée égale à la vitesse : vitesse conservée');
  // Le frein ne fait jamais repartir en arrière
  const slow = new Car(null, { start: START, type: CarTypes.get('camion') });
  slow.vel.set(0.2, 0);
  slow.frameCount = 100;
  slow.steerFromOutputs([0.5, 1, 1]);
  slow.update();
  assert.ok(slow.vel.x >= -1e-12 && slow.vel.mag() < 1e-9);
});

test('types : inertie (masse) et adhérence', () => {
  const { Car, CarTypes } = setup();
  const accel = id => {
    const car = new Car(null, { start: START, type: CarTypes.get(id) });
    car.vel.set(0.001, 0);
    car.frameCount = 100;
    car.steerFromOutputs([0.5, 1]);
    return car.acc.mag();
  };
  assert.ok(Math.abs(accel('berline') - 0.5) < 1e-9);
  assert.ok(Math.abs(accel('camion') - 0.5 / 2.5) < 1e-9, 'camion : force / masse');

  // Drift : à virage égal, la force latérale est réduite par l'adhérence
  const lateral = id => {
    const car = new Car(null, { start: START, type: CarTypes.get(id) });
    car.vel.set(5, 0);
    car.frameCount = 100;
    car.steerFromOutputs([1, 5 / (6 * car.type.speedFactor)]);
    return Math.abs(car.acc.y);
  };
  assert.ok(lateral('drift') < 0.5 * lateral('citadine'));
});

test('types : portée des capteurs du type (camion myope)', () => {
  const { Car, CarTypes } = setup();
  // Mur perpendiculaire à 120 px devant la voiture
  const wall = { a: new Vector(620, 200), b: new Vector(620, 500) };
  const sees = id => {
    const car = new Car(null, { start: START, type: CarTypes.get(id) });
    car.pos.set(500, 350);
    car.vel.set(2, 0);
    return car.look([wall])[2]; // rayon central
  };
  assert.ok(Math.abs(sees('berline') - (1 - 120 / 150)) < 1e-9);
  assert.equal(sees('camion'), 0, 'portée 100 px < 120 px');
  for (const type of CarTypes.LIST) {
    for (const key of ['speedFactor', 'maxForce', 'maxTurn', 'brakeDecel', 'grip', 'mass', 'width', 'height', 'sightDist', 'fov']) {
      assert.ok(Number.isFinite(type[key]) && type[key] > 0, `${type.id}.${key}`);
    }
    assert.ok(type.grip <= 1);
  }
});

test('tours : arrivée après lapsToFinish tours, temps au tour enregistrés', () => {
  const { Car, buildWorld } = setup();
  const world = buildWorld('ovale');
  const car = new Car(null, { start: world.start, lapsToFinish: 2 });
  const cps = world.checkpoints;
  const visit = () => {
    const cp = cps[car.checkpointIndex];
    car.pos.set((cp.a.x + cp.b.x) / 2, (cp.a.y + cp.b.y) / 2);
    car.frameCount += 5;
    car.checkCheckpoints(cps);
  };
  while (car.laps < 1) visit();
  assert.equal(car.finished, false);
  assert.equal(car.dead, false);
  const firstLap = car.lapFrames[0];
  for (let i = 0; i < cps.length; i++) visit();
  assert.equal(car.laps, 2);
  assert.equal(car.finished, true);
  assert.equal(car.dead, true);
  assert.equal(car.lapFrames.length, 2);
  assert.equal(car.lapFrames[1] - firstLap, cps.length * 5);
});

test('entraînement : simulation courte, invariants et générations', () => {
  const { Trainer, Settings, buildWorld } = setup(7);
  const s = plain(Settings.defaults());
  s.populationSize = 10;
  s.circuits = ['ovale'];
  s.termination.successRate.enabled = false;
  const trainer = new Trainer(s, { buildWorld });
  let steps = 0;
  while (trainer.generation < 3 && steps < 20000) {
    trainer.step();
    steps++;
    for (const car of trainer.cars) {
      assert.ok(finite(car.pos) && finite(car.vel));
      assert.ok(car.pos.x >= -10 && car.pos.x <= 1010 && car.pos.y >= -10 && car.pos.y <= 710);
      assert.ok(car.vel.mag() <= car.maxSpeed() + 1e-9);
    }
  }
  assert.equal(trainer.generation, 3);
  assert.equal(trainer.cars.length + trainer.saved.length, 10, 'taille de population conservée');
  assert.ok(trainer.bestBrain, 'meilleur cerveau gardé');
  assert.ok(Number.isFinite(trainer.lastStats.mean));
});

test('entraînement : types mélangés répartis dans la population', () => {
  const { Trainer, Settings, buildWorld } = setup();
  const s = plain(Settings.defaults());
  s.populationSize = 10;
  s.circuits = ['ovale'];
  s.carTypes = { mode: 'melange', ids: ['sportive', 'camion'] };
  const trainer = new Trainer(s, { buildWorld });
  const ids = trainer.cars.map(c => c.type.id);
  assert.equal(ids.filter(id => id === 'sportive').length, 5);
  assert.equal(ids.filter(id => id === 'camion').length, 5);
});

test('entraînement : passage de circuit après un tour, cerveau conservé', () => {
  const { Trainer, Settings, buildWorld } = setup();
  const s = plain(Settings.defaults());
  s.populationSize = 10;
  s.mutationRate = 0;
  s.circuits = ['ovale', 'haricot'];
  s.termination.successRate.enabled = false;
  const built = [];
  const trainer = new Trainer(s, { buildWorld: id => { built.push(id); return buildWorld(id); } });
  const before = trainer.cars.map(c => JSON.stringify(c.brain.toJSON()));

  // Génération sans tour complet : on reste sur l'ovale
  trainer.cars.forEach(c => { c.dead = true; });
  trainer.step();
  assert.equal(trainer.curriculum.current(), 'ovale');
  assert.equal(trainer.world.checkpoints.length, buildWorld('ovale').checkpoints.length);

  // Une voiture a fait un tour : passage au haricot
  trainer.cars.forEach(c => { c.dead = true; });
  trainer.cars[3].laps = 1;
  trainer.step();
  assert.equal(trainer.curriculum.current(), 'haricot');
  assert.deepEqual(plain(built), ['ovale', 'haricot']);
  assert.equal(trainer.cars[0].checkpointIndex, buildWorld('haricot').start.checkpointIndex);
  // Mutation nulle : chaque nouveau cerveau est la copie d'un cerveau de départ (pas de réinitialisation)
  for (const car of trainer.cars) assert.ok(before.includes(JSON.stringify(car.brain.toJSON())));

  // Un tour sur le haricot : retour au début de la liste
  trainer.cars.forEach(c => { c.dead = true; });
  trainer.cars[0].laps = 1;
  trainer.step();
  assert.equal(trainer.curriculum.current(), 'ovale');
  assert.equal(trainer.curriculum.passed, 2);
});

test('entraînement : arrêt (générations max), raison et population figée', () => {
  const { Trainer, Settings, buildWorld } = setup();
  const s = plain(Settings.defaults());
  s.populationSize = 10;
  s.circuits = ['ovale'];
  s.termination.successRate.enabled = false;
  s.termination.maxGenerations = { enabled: true, value: 2 };
  const events = [];
  const trainer = new Trainer(s, { buildWorld, onEvent: (type, msg) => events.push([type, msg]) });
  for (let g = 0; g < 2; g++) {
    trainer.cars.forEach(c => { c.dead = true; });
    trainer.step();
  }
  assert.equal(trainer.stopped, true);
  assert.match(trainer.stopReason, /générations/);
  assert.equal(events.filter(e => e[0] === 'stop').length, 1);
  const frozen = trainer.cars.map(c => JSON.stringify(c.brain.toJSON()));
  for (let g = 0; g < 3; g++) {
    trainer.cars.forEach(c => { c.dead = true; });
    trainer.step();
    assert.deepEqual(trainer.cars.map(c => JSON.stringify(c.brain.toJSON())), frozen, 'aucune mutation après l\'arrêt');
  }
  trainer.resume();
  assert.equal(trainer.stopped, false);
});

test('entraînement : arrêt par durée en secondes (temps réel injecté)', () => {
  const { Trainer, Settings, buildWorld } = setup();
  const s = plain(Settings.defaults());
  s.populationSize = 10;
  s.circuits = ['ovale'];
  s.termination.successRate.enabled = false;
  s.termination.maxTime = { enabled: true, value: 10 };
  const trainer = new Trainer(s, { buildWorld });
  for (let i = 0; i < 99; i++) trainer.tick(0.1);
  assert.equal(trainer.stopped, false);
  trainer.tick(0.1 + 1e-9);
  assert.equal(trainer.stopped, true);
  assert.match(trainer.stopReason, /Temps/);
});

test('course : aucune mutation, résultats par circuit et classement', () => {
  const { Race, NeuralNetwork, buildWorld } = setup(3);
  const brain = new NeuralNetwork([8, 20, 2], seededRandom(1));
  const before = JSON.stringify(brain.toJSON());
  const race = new Race({
    entrants: [
      { label: 'A', brain, typeId: 'berline' },
      { label: 'B', brain, typeId: 'camion' },
      { label: 'C', brain: new NeuralNetwork([8, 8, 3], seededRandom(2)), typeId: 'drift' },
    ],
    circuits: ['ovale', 'epingles'], laps: 1, buildWorld, timeLimitPerLap: 30,
  });
  let steps = 0;
  while (race.state === 'running' && steps < 10000) {
    race.step();
    steps++;
    for (const car of race.cars) assert.ok(finite(car.pos));
    const rows = race.standings();
    assert.deepEqual(plain(rows.map(r => r.position)), [1, 2, 3]);
  }
  assert.equal(race.state, 'finished');
  assert.equal(race.results.length, 2);
  assert.deepEqual(plain(race.results.map(r => r.circuitId)), ['ovale', 'epingles']);
  assert.equal(JSON.stringify(brain.toJSON()), before, 'le cerveau n\'a pas été modifié');
  const overall = race.overall();
  assert.equal(overall.length, 3);
  for (let i = 1; i < overall.length; i++) assert.ok(overall[i - 1].points >= overall[i].points);
});

test('course : classement (arrivées, temps, progression) et points', () => {
  const { Race, NeuralNetwork, buildWorld } = setup();
  const nn = new NeuralNetwork([6, 4, 2], seededRandom(1));
  const race = new Race({
    entrants: ['A', 'B', 'C', 'D'].map(label => ({ label, brain: nn, typeId: 'berline' })),
    circuits: ['ovale'], laps: 2, buildWorld,
  });
  const [a, b, c, d] = race.cars;
  // A : abandon tôt ; B : arrivée en 1200 images ; C : arrivée en 1000 ; D : en course, 30 checkpoints
  a.dead = true; a.checkpointsPassed = 5;
  b.finished = true; b.dead = true; b.laps = 2; b.lapFrames = [600, 1200];
  c.finished = true; c.dead = true; c.laps = 2; c.lapFrames = [480, 1000];
  d.checkpointsPassed = 30; d.laps = 0;
  const rows = race.standings();
  assert.deepEqual(plain(rows.map(r => r.label)), ['C', 'B', 'D', 'A']);
  assert.ok(Math.abs(rows[0].totalTime - 1000 / 60) < 1e-9);
  assert.ok(Math.abs(rows[0].bestLap - 480 / 60) < 1e-9);
  assert.deepEqual(plain(rows.map(r => r.status)), ['Arrivée', 'Arrivée', 'En course', 'Abandon']);
  d.dead = true;
  race.step(); // plus personne en course : fin du circuit
  assert.equal(race.state, 'finished');
  assert.deepEqual(plain(race.results[0].rows.map(r => r.points)), [10, 8, 0, 0]);
  assert.throws(() => new Race({ entrants: [], circuits: ['ovale'], laps: 1, buildWorld }), { name: 'RangeError' });
});

test('capteurs : 8 entrées, deux rayons perpendiculaires (gauche -90°, droite +90°) puis la vitesse', () => {
  const { Car, CarTypes } = setup();
  const car = new Car(null, { start: START });
  car.pos.set(500, 350);
  car.vel.set(2, 0); // cap vers +x
  // Mur à 60 px d'un côté seulement : y = 410 (à droite du cap en repère écran) puis y = 290
  const below = { a: new Vector(300, 410), b: new Vector(700, 410) };
  const above = { a: new Vector(300, 270), b: new Vector(700, 270) };
  const sight = CarTypes.get('berline').sightDist;

  let inputs = car.look([below]);
  assert.equal(inputs.length, 8);
  assert.equal(car.rays.length, 7);
  assert.ok(Math.abs(inputs[6] - (1 - 60 / sight)) < 1e-9, 'rayon +90° voit le mur en y = 410');
  assert.equal(inputs[5], 0, 'rayon -90° ne voit rien');

  inputs = car.look([above]);
  assert.ok(Math.abs(inputs[5] - (1 - 80 / sight)) < 1e-9, 'rayon -90° voit le mur en y = 270');
  assert.equal(inputs[6], 0);

  // Les rayons suivent le cap : voiture tournée vers +y, les côtés échangent leurs axes
  car.vel.set(0, 2);
  inputs = car.look([{ a: new Vector(560, 200), b: new Vector(560, 500) }]);
  assert.ok(Math.abs(inputs[5] - (1 - 60 / sight)) < 1e-9, 'à gauche du cap = x croissant');

  // Dernière entrée : vitesse normalisée
  car.vel.set(3, 0);
  assert.ok(Math.abs(car.look([])[7] - 3 / car.maxSpeed()) < 1e-9);
  // Sans mur, tous les capteurs valent 0
  assert.deepEqual(plain(car.look([]).slice(0, 7)), [0, 0, 0, 0, 0, 0, 0]);
});
