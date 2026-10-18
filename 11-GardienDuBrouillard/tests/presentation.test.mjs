import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

const { get } = load(29);
const g = n => get(n);
const Presentation = g('Presentation'), PresentationRun = g('PresentationRun'), PuppetController = g('PuppetController'), NetworkView = g('NetworkView'),
  VideoRecorder = g('VideoRecorder'), NeuralNetwork = g('NeuralNetwork'), Arena = g('Arena'), Combat = g('Combat'), Boss = g('Boss'), Player = g('Player'),
  BossBrain = g('BossBrain'), PackBrain = g('PackBrain'), SoundBank = g('SoundBank'), WebAudioBackend = g('WebAudioBackend'), seededRandom = g('seededRandom');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const deps = () => ({ arena: new Arena(), bossBrain: NeuralNetwork.fromJSON(g('PRETRAINED_BOSS').brain), packBrain: NeuralNetwork.fromJSON(g('PRETRAINED_PACK').brain), seed: 4 });

/** Joue une scène pendant sa durée (comme la présentation : un combat fini est remonté). */
function play(scene, seconds = scene.duration) {
  const d = deps();
  let { fight } = Presentation.build(scene, d);
  const log = { steps: 0, wander: 0, forces: {}, dodges: 0, charges: 0, parries: 0, criticals: 0, surround: 0, decided: 0 };
  for (let t = 0; t < seconds; t += Combat.DT) {
    if (fight.over) {
      log.dodges += fight.boss ? fight.boss.stats.dodges : 0;
      log.charges += fight.boss ? fight.boss.stats.charges : 0;
      log.parries += fight.player.stats.parries;
      log.criticals += fight.player.stats.criticals;
      d.seed++;
      fight = Presentation.build(scene, d).fight;
    }
    fight.step();
    log.steps++;
    if (fight.boss) {
      if (fight.boss.wandering) log.wander++;
      if (fight.bossController.lastOutputs) log.decided++;
      for (const f of fight.boss.forces) if (f.force.mag() > 1e-6) log.forces[f.name] = (log.forces[f.name] || 0) + 1;
    }
    if (fight.lastEncirclement && fight.lastEncirclement.surrounded) log.surround++;
  }
  log.dodges += fight.boss ? fight.boss.stats.dodges : 0;
  log.charges += fight.boss ? fight.boss.stats.charges : 0;
  log.parries += fight.player.stats.parries;
  log.criticals += fight.player.stats.criticals;
  return log;
}
const scene = id => Presentation.SCENES.find(s => s.id === id);

test('scénario : scènes complètes, 2 à 4 minutes, couches et marionnettes connues, refus des scènes invalides', () => {
  assert.equal(Presentation.check(Presentation.SCENES), Presentation.SCENES);
  const explain = Presentation.totalDuration(Presentation.SCENES.filter(s => s.kind !== 'campaign'));
  assert.ok(explain >= 120 && explain <= 240, 'explications : ' + explain + ' s');
  assert.equal(Presentation.SCENES[1].kind, 'campaign', 'la partie complète vient juste après le titre, avant les explications');
  assert.ok(Presentation.SCENES[1].duration >= 60, 'assez de temps pour finir la campagne');
  assert.equal(Presentation.SCENES[0].kind, 'card');
  assert.equal(Presentation.SCENES.at(-1).kind, 'card');
  for (const id of ['wander', 'brain', 'forces', 'evade', 'charge', 'avoid', 'parry', 'pack', 'evolution']) assert.ok(scene(id), id);
  assert.ok(scene('brain').show.includes('network'), 'le réseau du boss est montré en direct');
  assert.ok(scene('pack').show.includes('packNetwork'));
  assert.throws(() => Presentation.check([{ id: 'a', kind: 'film', duration: 1, title: 'x', lines: ['y'] }]), { name: 'RangeError' });
  assert.throws(() => Presentation.check([{ id: 'a', kind: 'boss', duration: 1, title: 'x', lines: ['y'], show: ['fumée'] }]), { name: 'RangeError' });
  assert.throws(() => Presentation.check([{ id: 'a', kind: 'card', duration: 0, title: 'x', lines: ['y'] }]), { name: 'RangeError' });
  assert.throws(() => Presentation.check([{ id: 'a', kind: 'card', duration: 1, title: 'x', lines: ['y'] }, { id: 'a', kind: 'card', duration: 1, title: 'x', lines: ['y'] }]), { name: 'RangeError' });
});

test('déroulé : changement de scène à la durée exacte, légendes réparties, scène suivante, avancement, fin', () => {
  const scenes = [{ id: 'a', kind: 'card', duration: 2, title: 'A', lines: ['1', '2'] }, { id: 'b', kind: 'card', duration: 1, title: 'B', lines: ['3'] }];
  const r = new PresentationRun(scenes);
  assert.equal(r.scene.id, 'a');
  assert.equal(r.lineIndex(), 0);
  let changed = false;
  for (let i = 0; i < 59; i++) changed = r.update(1 / 60) || changed;
  assert.equal(r.lineIndex(), 0, 'juste avant la moitié : première ligne');
  r.update(1 / 60);
  assert.equal(r.lineIndex(), 1, 'à la moitié : deuxième ligne');
  for (let i = 0; i < 59; i++) changed = r.update(1 / 60) || changed;
  assert.equal(changed, false);
  assert.equal(r.update(1 / 60), true, 'à 2 s exactement : scène suivante');
  assert.equal(r.scene.id, 'b');
  assert.ok(close(r.progress(), 2 / 3, 1e-6));
  assert.equal(r.next(), false, 'plus de scène');
  assert.equal(r.done, true);
  assert.equal(r.scene, null);
  assert.equal(r.progress(), 1);
  assert.equal(r.update(1), false);
});

test('chaque scène montre vraiment ce qu\'elle annonce (combats simulés avec les cerveaux fournis)', () => {
  const w = play(scene('wander'));
  assert.ok(w.wander / w.steps > 0.9, 'wander : le boss erre');
  assert.ok(w.forces.wander > 0.9 * w.steps, 'force wander appliquée');
  const b = play(scene('brain'));
  assert.ok(b.decided > 0.5 * b.steps, 'le réseau décide la majeure partie de la scène');
  assert.ok((b.forces.arrive || 0) + (b.forces.seek || 0) > 100, 'ses décisions passent par arrive et seek');
  const f = play(scene('forces'));
  assert.ok((f.forces.seek || 0) > 50, 'seek visible pour le triangle de Reynolds');
  const e = play(scene('evade'));
  assert.ok(e.dodges >= 1 && e.forces.evade > 0, 'evade : au moins une esquive');
  const c = play(scene('charge'));
  assert.ok(c.charges >= 1, 'au moins une ruée');
  const a = play(scene('avoid'));
  assert.ok(a.forces.avoid > 0 && a.forces.stayInside > 0, 'évitement et confinement');
  const p = play(scene('parry'));
  assert.ok(p.parries >= 1 && p.criticals >= 1, 'parade puis riposte critique');
  const k = play(scene('pack'));
  assert.ok(k.surround > 0, 'la meute encercle le chevalier');
  assert.equal(Presentation.build(scene('intro'), deps()).fight, null);
  assert.equal(Presentation.build(scene('evolution'), deps()).fight, null);
});

test('marionnettes : stratégies connues, parade juste avant la frappe, riposte sur le boss déséquilibré', () => {
  assert.throws(() => new PuppetController('danse'), { name: 'RangeError' });
  assert.throws(() => new PuppetController('robot'), { name: 'RangeError' });
  const arena = new Arena();
  const p = new Player(400, 350), b = new Boss(480, 350);
  const pc = new PuppetController('parry');
  b.action = Combat.newAttack('boss', Math.PI);
  b.action.t = Combat.ATTACKS.boss.windup - PuppetController.PARRY_LEAD - 0.02;
  assert.equal(pc.intent(p, b, arena, Combat.DT).parry, false, 'trop tôt');
  b.action.t = Combat.ATTACKS.boss.windup - PuppetController.PARRY_LEAD;
  assert.equal(pc.intent(p, b, arena, Combat.DT).parry, true);
  b.action = null;
  b.parried();
  const r = pc.intent(p, b, arena, Combat.DT);
  assert.ok(r.heavy || r.light, 'riposte');
  const ap = new PuppetController('approach');
  const i = ap.intent(new Player(100, 100), new Boss(400, 100), arena, Combat.DT);
  assert.ok(i.move.x > 0.99 && !i.lock, 'approche : droit vers le boss');
  assert.deepEqual(plain(new PuppetController('idle').intent(p, b, arena, Combat.DT).move), { x: 0, y: 0 });
});

test('forces gardées pour l\'affichage : leur somme est exactement la force appliquée (boss et chevalier)', () => {
  const d = deps();
  const { fight } = Presentation.build(scene('forces'), d);
  for (let i = 0; i < 200; i++) {
    const b = fight.boss, p = fight.player;
    const intent = fight.playerController.intent(p, b, fight.arena, Combat.DT);
    const decision = fight.bossController.decide(b, p, fight.arena);
    p.acc.set(0, 0);
    b.acc.set(0, 0);
    p.control(intent, b, fight.arena);
    b.control(decision, p, fight.arena, Combat.DT);
    for (const e of [b, p]) {
      const sum = e.forces.reduce((s, f) => ({ x: s.x + f.force.x, y: s.y + f.force.y }), { x: 0, y: 0 });
      assert.ok(close(sum.x, e.acc.x, 1e-9) && close(sum.y, e.acc.y, 1e-9), 'somme des forces notées = accélération');
      for (const f of e.forces) assert.ok(typeof f.name === 'string' && f.name.length > 2);
    }
    fight.step();
  }
});

test('schéma du réseau : disposition, signaux triés, lecture en mots, dessin sans recalcul', () => {
  const L = NetworkView.layout([3, 2, 1], 0, 0, 200, 90);
  assert.equal(L.layers.length, 3);
  assert.deepEqual(plain(L.layers[0].map(p => p.y)), [15, 45, 75]);
  assert.deepEqual(plain(L.layers.map(l => l[0].x)), [0, 100, 200]);
  const nn = new NeuralNetwork([3, 2, 1], seededRandom(2));
  nn.predict([1, 0, 0.5]);
  const s = NetworkView.signals(nn, nn.activations, 5);
  assert.equal(s.length, 5);
  for (let k = 1; k < s.length; k++) assert.ok(s[k - 1].signal >= s[k].signal, 'triés');
  const e = s[0];
  assert.ok(close(e.signal, Math.abs(nn.weights[e.l][e.j * nn.sizes[e.l] + e.i] * nn.activations[e.l][e.i]), 1e-6));
  assert.equal(NetworkView.signals(nn, nn.activations).length, 3 * 2 + 2 * 1, 'toutes les liaisons quand il y en a peu');
  // Lecture en mots
  const approach = NetworkView.bossReading([0.9, 0.7, 0.2, 0.2, 0.2, 0.8]);
  assert.match(approach[0], /arrive/);
  assert.ok(approach.some(l => /hallebarde/.test(l)));
  assert.match(NetworkView.bossReading([0.1, 0.1, 0.1, 0.1, 0.1, 0.2])[0], /flee/);
  assert.match(NetworkView.packReading([0.5, 0.25, 0, 1, 0.9]).join(' '), /pursue 50 %.*flanc 25 %.*Morsure au-dessus/);
  // Dessin : ne rappelle pas predict et ne change pas les activations
  const brain = NeuralNetwork.fromJSON(g('PRETRAINED_BOSS').brain);
  brain.predict(new Array(16).fill(0.5));
  const before = JSON.stringify(brain.activations.map(a => Array.from(a)));
  let calls = 0;
  const orig = brain.predict.bind(brain);
  brain.predict = x => { calls++; return orig(x); };
  NetworkView.draw({ nn: brain, activations: brain.activations, inputLabels: BossBrain.INPUT_LABELS, outputLabels: BossBrain.OUTPUT_LABELS,
    thresholds: [0.5, 0.6, 0.6, 0.6, 0.6, 0.5], reading: ['x'] }, 0, 0, 500, 400);
  assert.equal(calls, 0, 'aucun recalcul');
  assert.equal(JSON.stringify(brain.activations.map(a => Array.from(a))), before);
  // Réseau partagé de la meute : chaque Creux garde ses propres activations
  const ctrl = new (g('NeuralPackController'))(NeuralNetwork.fromJSON(g('PRETRAINED_PACK').brain));
  const pf = Presentation.build(scene('pack'), deps()).fight;
  pf.packController = ctrl;
  for (let i = 0; i < 30; i++) pf.step();
  const m0 = ctrl.memory.get(pf.creux[0]), m1 = ctrl.memory.get(pf.creux[1]);
  assert.equal(m0.layers.length, PackBrain.SIZES.length);
  assert.notDeepEqual(Array.from(m0.layers[0]), Array.from(m1.layers[0]), 'deux Creux, deux états du réseau');
  assert.deepEqual(Array.from(m0.layers.at(-1)), Array.from(m0.outputs), 'dernière couche = ses sorties');
});

test('enregistrement vidéo : format choisi, image et son réunis, vidéo rendue à l\'arrêt', async () => {
  class FakeMR {
    static isTypeSupported(m) { return m === 'video/webm;codecs=vp8,opus'; }
    constructor(stream, opts) { this.stream = stream; this.opts = opts; this.state = 'inactive'; FakeMR.last = this; }
    start() { this.state = 'recording'; this.ondataavailable({ data: { size: 3 } }); this.ondataavailable({ data: { size: 0 } }); }
    stop() { this.state = 'inactive'; this.ondataavailable({ data: { size: 5 } }); this.onstop(); }
  }
  class FakeStream { constructor(tracks) { this.tracks = tracks; } }
  class FakeBlob { constructor(parts, o) { this.parts = parts; this.type = o.type; } }
  assert.equal(VideoRecorder.pickMime(FakeMR), 'video/webm;codecs=vp8,opus');
  assert.equal(VideoRecorder.pickMime(null), '');
  assert.equal(VideoRecorder.available(FakeMR, { captureStream() {} }), true);
  assert.equal(VideoRecorder.available(FakeMR, {}), false, 'sans captureStream');
  assert.equal(VideoRecorder.available(null, { captureStream() {} }), false);
  const r = new VideoRecorder({ MediaRecorder: FakeMR, MediaStream: FakeStream, Blob: FakeBlob,
    videoStream: { getVideoTracks: () => ['image'] }, audioStream: { getAudioTracks: () => ['son'] } });
  r.start();
  assert.equal(r.recording, true);
  assert.deepEqual(FakeMR.last.stream.tracks, ['image', 'son'], 'image et son dans le même flux');
  assert.equal(FakeMR.last.opts.mimeType, 'video/webm;codecs=vp8,opus');
  const blob = await r.stop();
  assert.equal(blob.parts.length, 2, 'morceaux vides ignorés');
  assert.equal(blob.type, 'video/webm');
  assert.ok(/\.webm$/.test(VideoRecorder.FILENAME));
});

test('son de la présentation : musique par scène, flux enregistrable créé une seule fois', () => {
  assert.equal(SoundBank.musicFor('presentation', 'boss', 'fight'), 'boss');
  assert.equal(SoundBank.musicFor('presentation', 'pack', 'fight'), 'ambient');
  assert.equal(SoundBank.musicFor('presentation', 'card', 'fight'), 'ambient');
  assert.equal(SoundBank.musicFor('presentation', null, 'fight'), null, 'présentation arrêtée : silence');
  const made = { gain: 0, dest: 0, source: 0 };
  class Ctx {
    constructor() { this.state = 'running'; this.destination = {}; }
    createGain() { made.gain++; return { connect() {} }; }
    createMediaStreamDestination() { made.dest++; return { stream: 'flux' }; }
    createMediaElementSource() { made.source++; return { connect() {} }; }
  }
  class A { constructor() { this.paused = true; } }
  const be = new WebAudioBackend({ AudioContext: Ctx, Audio: A, fetch: () => Promise.reject(new Error('x')) });
  assert.equal(be.captureStream(), 'flux');
  assert.equal(be.captureStream(), 'flux');
  assert.deepEqual(made, { gain: 1, dest: 1, source: 1 }, 'bus, destination et musique raccordés une seule fois');
  assert.ok(be.output() !== be.ctx.destination, 'les effets passent par le bus enregistré');
  assert.equal(new WebAudioBackend({ fetch: () => null }).captureStream(), null, 'sans Web Audio : pas de son enregistré');
});

test('durée inscrite dans la vidéo WebM : ajoutée, ou remplacée, et taille du Segment mise à jour', () => {
  const W = g('WebmDuration');
  // Petit fichier EBML : en-tête, Segment (taille inconnue), Info (TimecodeScale = 1 ms), puis un Cluster
  const info = [0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40];            // TimecodeScale = 1 000 000 ns
  const file = (segSize, infoPayload) => Uint8Array.from([
    0x1A, 0x45, 0xDF, 0xA3, 0x84, 0x42, 0x86, 0x81, 0x01,             // en-tête EBML (EBMLVersion = 1)
    0x18, 0x53, 0x80, 0x67, ...segSize,
    0x15, 0x49, 0xA9, 0x66, 0x80 | infoPayload.length, ...infoPayload,
    0x1F, 0x43, 0xB6, 0x75, 0x82, 0xAA, 0xBB                            // Cluster (2 octets)
  ]);
  const durationOf = bytes => {
    for (let i = 0; i + 11 <= bytes.length; i++) {
      if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) return new DataView(bytes.buffer, bytes.byteOffset + i + 3, 8).getFloat64(0);
    }
    return null;
  };
  const unknown = [0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF];
  const src = file(unknown, info);
  assert.equal(durationOf(src), null);
  const out = W.fix(src, 186451);
  assert.equal(durationOf(out), 186451, 'durée en millisecondes (TimecodeScale = 1 ms)');
  assert.equal(out.length, src.length + 11 + 7, 'Duration (11 octets) + taille d\'Info codée sur 8 octets');
  assert.deepEqual(Array.from(out.slice(-7)), [0x1F, 0x43, 0xB6, 0x75, 0x82, 0xAA, 0xBB], 'la suite du fichier est intacte');
  // Duration déjà présente : remplacée, pas ajoutée deux fois
  const again = W.fix(out, 5000);
  assert.equal(durationOf(again), 5000);
  assert.equal(again.length, out.length);
  // TimecodeScale de 2 ms : la durée est exprimée en unités de 2 ms
  const scaled = W.fix(file(unknown, [0x2A, 0xD7, 0xB1, 0x83, 0x1E, 0x84, 0x80]), 1000);
  assert.equal(durationOf(scaled), 500);
  // Segment de taille connue : sa taille suit
  const payloadLen = 7 + 2 + 5 + 7;   // Info + Cluster
  const known = W.fix(file([0x80 | payloadLen], info), 100);
  assert.equal(W.readSize(known, 13).size, payloadLen + 11 + 7);
  // Fichier illisible : rendu tel quel
  const junk = Uint8Array.from([1, 2, 3, 4]);
  assert.equal(W.fix(junk, 10), junk);
});

test('partie complète : le joueur automatique « vitrine » finit la campagne (meute, feu de camp, Gardien)', () => {
  const ShowcasePlayerController = g('ShowcasePlayerController'), CampaignRun = g('CampaignRun'), PackFight = g('PackFight'), Fight = g('Fight'),
    NeuralPackController = g('NeuralPackController'), NeuralBossController = g('NeuralBossController'), Settings = g('Settings');
  const d = deps(), s = Settings.defaults();
  const run = new CampaignRun();
  const pf = new PackFight({ arena: d.arena, playerController: new ShowcasePlayerController(), packController: new NeuralPackController(d.packBrain),
    size: PackFight.SIZE, maxTime: 120, estus: run.carry.estus, playerHp: run.carry.hp, pillars: s.pillarCount, seed: 7 });
  assert.equal(pf.run().winner, 'player', 'la meute est vaincue');
  assert.ok(pf.player.stats.parries >= 1, 'il pare des morsures');
  run.win(pf.player);
  while (run.carry.hp <= 75 && run.drink());
  run.leaveRest();
  const bf = new Fight({ arena: d.arena, playerController: new ShowcasePlayerController(), bossController: new NeuralBossController(d.bossBrain),
    maxTime: 180, detectRadius: s.detectRadius, estus: run.carry.estus, playerHp: run.carry.hp, pillars: s.pillarCount, seed: 1007 });
  const r = bf.run();
  assert.equal(r.winner, 'player', 'le Gardien est vaincu');
  assert.ok(bf.player.stats.parries >= 1 && bf.player.stats.criticals >= 1, 'par des parades et des ripostes critiques');
  run.win(bf.player);
  assert.equal(run.done, true, 'campagne finie');
  assert.ok(pf.result.duration + r.duration < 90, 'assez courte pour la vidéo');
});
