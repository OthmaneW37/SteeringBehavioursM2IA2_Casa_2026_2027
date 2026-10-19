import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { load, read, plain } from './helpers.mjs';

const { get } = load(23);
const AudioSettings = get('AudioSettings'), SoundBank = get('SoundBank'), AudioMixer = get('AudioMixer'), WebAudioBackend = get('WebAudioBackend'),
  Player = get('Player'), Boss = get('Boss'), Combat = get('Combat'), Fight = get('Fight'), Arena = get('Arena'),
  ScriptedPlayerController = get('ScriptedPlayerController'), HandBossController = get('HandBossController'), seededRandom = get('seededRandom'), Settings = get('Settings');
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

/** Faux moteur : garde la trace de ce qui est joué. */
function fakeBackend() {
  return { sfx: [], music: [], gains: [], playSfx(f, g) { this.sfx.push([f, g]); }, setMusic(f) { this.music.push(f); }, setMusicGain(g) { this.gains.push(g); } };
}

test('fichiers : chaque son et chaque musique existent, licences jointes et créditées', () => {
  const credits = read('CREDITS.md');
  for (const [name, spec] of Object.entries(SoundBank.SFX)) {
    assert.ok(spec.files.length > 0 && spec.volume > 0 && spec.volume <= 1 && spec.cooldown >= 0, name);
    for (const f of spec.files) assert.ok(existsSync(new URL('../' + SoundBank.sfxPath(f), import.meta.url)), SoundBank.sfxPath(f));
  }
  for (const file of Object.values(SoundBank.MUSIC)) {
    assert.ok(existsSync(new URL('../' + SoundBank.DIR + file, import.meta.url)), file);
    assert.ok(credits.includes(file.split('/').pop()), file + ' créditée');
  }
  for (const lic of ['LICENSE-kenney-impact.txt', 'LICENSE-kenney-rpg.txt']) {
    assert.ok(existsSync(new URL('../libraries/audio/' + lic, import.meta.url)), lic);
    assert.ok(credits.includes(lic));
  }
  assert.ok(/CC0/.test(credits));
});

test('réglages du son : plages, RangeError, gardés et relus sans plantage', () => {
  for (const [name, p] of Object.entries(AudioSettings.PARAMETERS)) {
    assert.equal(AudioSettings.check(name, p.initial), p.initial);
    for (const bad of [p.min - 0.1, p.max + 0.1, NaN, '0.5', undefined]) assert.throws(() => AudioSettings.check(name, bad), { name: 'RangeError' }, `${name} = ${bad}`);
  }
  const data = {};
  const mem = { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  assert.deepEqual(plain(AudioSettings.load(mem)), plain(AudioSettings.defaults()));
  const s = Object.assign(AudioSettings.defaults(), { musicVolume: 0.2, muted: true });
  assert.equal(AudioSettings.save(mem, s), true);
  assert.deepEqual(plain(AudioSettings.load(mem)), plain(s));
  data[AudioSettings.KEY] = '{"masterVolume": 9}';
  assert.deepEqual(plain(AudioSettings.load(mem)), plain(AudioSettings.defaults()), 'valeur hors plage : réglages d\'origine');
  data[AudioSettings.KEY] = 'pas du json';
  assert.deepEqual(plain(AudioSettings.load(mem)), plain(AudioSettings.defaults()));
  const blocked = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.deepEqual(plain(AudioSettings.load(blocked)), plain(AudioSettings.defaults()));
  assert.equal(AudioSettings.save(blocked, AudioSettings.defaults()), false);
  assert.throws(() => AudioSettings.save(mem, { masterVolume: 2, musicVolume: 0, sfxVolume: 0 }), { name: 'RangeError' });
});

test('sons des événements du combat et musique de chaque scène', () => {
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'hit', who: 'boss', kind: 'boss' })), ['playerHurt']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'hit', who: 'boss', kind: 'bite' })), ['creuxBite', 'playerHurt']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'hit', who: 'player', kind: 'light' })), ['hitFlesh']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'hit', who: 'player', kind: 'heavy' })), ['hitHeavy']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'hit', who: 'player', kind: 'light', critical: true })), ['critical', 'hitHeavy']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'parry' })), ['parry']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'crumble' })), ['crash']);
  assert.deepEqual(plain(SoundBank.forEvent({ type: 'mist' })), []);
  for (const e of ['hit', 'parry', 'blocked', 'dodged', 'crash', 'creuxDeath']) {
    for (const n of SoundBank.forEvent({ type: e, who: 'player' })) assert.ok(SoundBank.SFX[n], n);
  }
  assert.equal(SoundBank.musicFor('title', null, 'fight'), 'ambient');
  assert.equal(SoundBank.musicFor('combat', 'boss', 'fight'), 'boss');
  assert.equal(SoundBank.musicFor('combat', 'pack', 'fight'), 'ambient');
  assert.equal(SoundBank.musicFor('combat', 'boss', 'rest'), 'ambient');
  assert.equal(SoundBank.musicFor('combat', 'boss', 'dead'), null, 'silence à la mort');
  assert.equal(SoundBank.musicFor('combat', 'boss', 'victory'), null);
  assert.equal(SoundBank.musicFor('training', null, 'fight'), null, 'laboratoire silencieux');
});

test('mélangeur : volumes multipliés, coupure, délai entre deux répétitions, variantes', () => {
  const b = fakeBackend();
  const s = Object.assign(AudioSettings.defaults(), { masterVolume: 0.5, sfxVolume: 0.8 });
  const m = new AudioMixer(b, s, () => 0.99);
  assert.equal(m.play('parry', 10), 'impactMetal_heavy_001', 'dernière variante pour un tirage à 0,99');
  assert.ok(close(b.sfx[0][1], 0.5 * 0.8 * SoundBank.SFX.parry.volume));
  assert.equal(b.sfx[0][0], SoundBank.sfxPath('impactMetal_heavy_001'));
  assert.equal(m.play('parry', 10 + SoundBank.SFX.parry.cooldown - 0.01), null, 'trop tôt');
  assert.ok(m.play('parry', 10 + SoundBank.SFX.parry.cooldown), 'délai écoulé (seuil inclus)');
  m.setSettings(Object.assign({}, s, { muted: true }));
  assert.equal(m.play('hitFlesh', 20), null, 'coupé : rien');
  m.setSettings(Object.assign({}, s, { sfxVolume: 0 }));
  assert.equal(m.play('hitFlesh', 21), null, 'effets à 0 : rien');
  assert.throws(() => m.play('explosion', 0), { name: 'RangeError' });
  const ev = new AudioMixer(fakeBackend(), AudioSettings.defaults(), () => 0);
  assert.deepEqual(plain(ev.onEvents([{ type: 'parry' }, { type: 'hit', who: 'player', kind: 'light', critical: true }], 5)), ['parry', 'critical', 'hitHeavy']);
});

test('indices d\'état : un son par coup, roulade, gorgée, technique du boss ; pas réguliers ; rien de fantôme', () => {
  const b = fakeBackend();
  const m = new AudioMixer(b, AudioSettings.defaults(), () => 0);
  const p = new Player(100, 100), boss = new Boss(300, 100);
  const fight = { player: p, boss: boss };
  m.resetCues(fight);
  assert.deepEqual(plain(m.cues(fight, 0, 1 / 60)), [], 'rien au départ');
  p.action = Combat.newAttack('heavy', 0);
  assert.deepEqual(plain(m.cues(fight, 1, 1 / 60)), ['swingHeavy']);
  assert.deepEqual(plain(m.cues(fight, 1.1, 1 / 60)), [], 'le même coup : une seule fois');
  p.action = Combat.newAttack('parry', 0);
  assert.deepEqual(plain(m.cues(fight, 2, 1 / 60)), [], 'une parade ne siffle pas');
  p.action = null;
  p.roll = { t: 0 };
  assert.deepEqual(plain(m.cues(fight, 3, 1 / 60)), ['roll']);
  p.roll = null;
  boss.action = Combat.newAttack('boss', 0);
  assert.deepEqual(plain(m.cues(fight, 4, 1 / 60)), ['bossTechnique']);
  // Pas : un toutes les STEP_INTERVAL s de marche, aucun à l'arrêt
  p.vel.set(3, 0);
  let steps = 0;
  for (let t = 0; t < 1.02; t += 1 / 60) steps += m.cues(fight, 10 + t, 1 / 60).filter(n => n === 'step').length;
  assert.equal(steps, Math.floor(1.02 / SoundBank.STEP_INTERVAL));
  p.vel.set(0, 0);
  assert.equal(m.cues(fight, 12, 1).filter(n => n === 'step').length, 0);
  // Nouveau combat : l'état suivi est remis à celui du combat (pas de son pour une action déjà en cours)
  const p2 = new Player(0, 0);
  p2.action = Combat.newAttack('light', 0);
  m.resetCues({ player: p2 });
  assert.deepEqual(plain(m.cues({ player: p2 }, 20, 1 / 60)), []);
});

test('musique : fondu exact, changement de morceau au silence, volume réglable', () => {
  const b = fakeBackend();
  const m = new AudioMixer(b, Object.assign(AudioSettings.defaults(), { masterVolume: 1, musicVolume: 0.5 }));
  m.setTrack('ambient');
  m.update(0.01);
  assert.equal(b.music.at(-1), SoundBank.DIR + SoundBank.MUSIC.ambient, 'aucune musique avant : départ immédiat');
  for (let t = 0; t < AudioMixer.FADE; t += 0.1) m.update(0.1);
  assert.ok(close(m.fade, 1));
  assert.ok(close(b.gains.at(-1), 0.5), 'pleine musique : volume général × musique');
  m.setTrack('boss');
  m.update(AudioMixer.FADE / 2);
  assert.equal(m.track, 'ambient', 'encore en fondu');
  assert.ok(close(m.fade, 0.5));
  m.update(AudioMixer.FADE / 2);
  assert.equal(m.track, 'boss', 'le nouveau morceau commence au silence');
  assert.equal(b.music.at(-1), SoundBank.DIR + SoundBank.MUSIC.boss);
  m.setTrack(null);
  for (let t = 0; t < AudioMixer.FADE + 0.1; t += 0.1) m.update(0.1);
  assert.equal(b.music.at(-1), null, 'silence');
  assert.throws(() => m.setTrack('techno'), { name: 'RangeError' });
  m.setSettings(Object.assign(AudioSettings.defaults(), { muted: true }));
  assert.equal(m.musicGain(), 0);
});

test('moteur Web Audio (dépendances injectées) : effets décodés une fois, musique en boucle, déblocage', async () => {
  const started = [], fetched = [];
  class Ctx {
    constructor() { this.state = 'suspended'; this.destination = {}; }
    resume() { this.state = 'running'; }
    decodeAudioData(b) { return Promise.resolve({ decoded: b }); }
    createBufferSource() { return { connect() {}, start() { started.push(this.buffer); } }; }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
  }
  class FakeAudio { constructor() { this.paused = true; this.volume = 1; } play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } }
  const be = new WebAudioBackend({ AudioContext: Ctx, Audio: FakeAudio, fetch: f => { fetched.push(f); return Promise.resolve({ arrayBuffer: () => Promise.resolve(f) }); } });
  be.preload(['a.ogg', 'a.ogg']);
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(fetched, ['a.ogg'], 'chargé une seule fois');
  assert.equal(be.playSfx('a.ogg', 0.5), false, 'avant un geste du joueur : muet');
  be.unlock();
  assert.equal(be.playSfx('a.ogg', 0.5), true);
  assert.equal(started.length, 1);
  assert.equal(be.playSfx('b.ogg', 0.5), false, 'pas encore chargé : chargement lancé');
  be.setMusic('m.ogg');
  assert.equal(be.music.loop, true);
  assert.equal(be.music.paused, false);
  be.setMusicGain(3);
  assert.equal(be.music.volume, 1, 'volume borné à 1');
  be.setMusic(null);
  assert.equal(be.music.paused, true);
  const none = new WebAudioBackend({ fetch: () => Promise.reject(new Error('x')) });
  assert.equal(none.playSfx('a.ogg', 1), false, 'sans Web Audio : rien ne plante');
  none.setMusic('m.ogg');
  none.unlock();
});

test('le son ne touche jamais au combat : un combat écouté est identique à un combat silencieux', () => {
  const make = () => new Fight({ arena: new Arena(), playerController: new ScriptedPlayerController(seededRandom(5), Settings.defaults()),
    bossController: new HandBossController(), maxTime: 20, seed: 5, pillars: 4 });
  // Chaque combat fixe l'aléatoire de p5 à sa création : on crée et on joue l'un après l'autre
  const heard = make();
  const m = new AudioMixer(fakeBackend(), AudioSettings.defaults(), () => 0.3);
  m.resetCues(heard);
  let t = 0;
  while (!heard.over) {
    heard.step();
    m.onEvents(heard.events, t);
    m.cues(heard, t, Combat.DT);
    t += Combat.DT;
  }
  const quiet = make();
  quiet.run();
  assert.deepEqual(plain(heard.result), plain(quiet.result));
  assert.ok(m.backend.sfx.length > 10, 'des sons ont bien été joués');
});
