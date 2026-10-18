import test from 'node:test';
import assert from 'node:assert/strict';
import { load, plain } from './helpers.mjs';

const { get } = load(13);
const Campaign = get('Campaign'), CampaignRun = get('CampaignRun'), Combat = get('Combat'), Fight = get('Fight'), PackFight = get('PackFight'),
  Arena = get('Arena'), HandPackController = get('HandPackController'), HandBossController = get('HandBossController'),
  PackPlayerController = get('PackPlayerController'), seededRandom = get('seededRandom');
const knight = (hp, estus) => ({ hp, estus });
const idle = { intent: () => ({ move: { x: 0, y: 0 }, lock: false, light: false, heavy: false, roll: false, drink: false }) };

// Campagne de test à trois étapes, repos nul : les règles générales, indépendamment de la campagne fournie
const SHORT = [
  { id: 'meute', kind: 'pack', label: 'Niveau 1', intro: '' },
  { id: 'feu', kind: 'rest', label: 'Feu', intro: '' },
  { id: 'gardien', kind: 'boss', label: 'Gardien', intro: '' }
];
const NONE = { heal: 0, estus: 0 };

test('campagne fournie : meute, feu, Veilleur, feu, Gardien renforcé ; le feu ravive une fiole ; étapes vérifiées', () => {
  assert.deepEqual(plain(Campaign.STEPS.map(s => s.kind)), ['pack', 'rest', 'veilleur', 'rest', 'boss']);
  for (const s of Campaign.STEPS) assert.ok(s.label.length > 3 && s.intro.length > 20, s.id);
  assert.equal(Campaign.STEPS.at(-1).options.bossHp, 500, 'le Gardien de campagne a une réserve de vie');
  assert.equal(Campaign.check(Campaign.STEPS), Campaign.STEPS);
  assert.throws(() => Campaign.check([]), { name: 'RangeError' });
  assert.throws(() => Campaign.check([{ id: 'a', kind: 'pack', label: 'A' }, { id: 'a', kind: 'boss', label: 'B' }]), { name: 'RangeError' }, 'doublon');
  assert.throws(() => Campaign.check([{ id: 'a', kind: 'dragon', label: 'A' }]), { name: 'RangeError' }, 'type inconnu');
  assert.throws(() => Campaign.check([{ id: 'a', kind: 'boss', label: 'A' }, { id: 'b', kind: 'rest', label: 'B' }]), { name: 'RangeError' }, 'finit par un repos');
  assert.deepEqual(plain(Campaign.REST), { heal: 0, estus: 1 }, 'une fiole, pas la vie');
  // Le feu de camp ravive À L'ARRIVÉE (on peut la boire sur place)
  const run = new CampaignRun();
  run.win(knight(30, 0));
  assert.equal(run.step.kind, 'rest');
  assert.deepEqual(plain(run.carry), { hp: 30, estus: 1 });
  assert.equal(run.drink(), true, 'la fiole ravivée se boit au feu');
  run.leaveRest();
  assert.equal(run.step.kind, 'veilleur');
  assert.deepEqual(plain(run.checkpoint), { hp: 30 + Combat.PLAYER.estus.heal, estus: 0 }, 'point de reprise après le repos');
  run.win(knight(20, 0));
  assert.deepEqual(plain(run.carry), { hp: 20, estus: 1 }, 'second feu : une fiole de plus');
  assert.equal(run.progress(), 'Étape 4 / 5');
});

test("report : la vie et les fioles du chevalier passent d'un combat à l'autre ; un repos nul ne rend rien", () => {
  const run = new CampaignRun(SHORT, Campaign.START, NONE);
  assert.equal(run.step.id, 'meute');
  assert.equal(run.progress(), 'Étape 1 / 3');
  assert.deepEqual(plain(run.carry), { hp: Combat.PLAYER.maxHp, estus: Combat.PLAYER.estus.charges });
  run.win(knight(37, 1));
  assert.equal(run.step.kind, 'rest');
  assert.deepEqual(plain(run.carry), { hp: 37, estus: 1 });
  run.leaveRest();
  assert.equal(run.step.id, 'gardien');
  assert.deepEqual(plain(run.carry), { hp: 37, estus: 1 }, 'repos nul : tout est conservé tel quel');
  run.win(knight(5, 0));
  assert.equal(run.done, true);
  assert.equal(run.step, null);
  assert.throws(() => run.win(knight(5, 0)), { name: 'RangeError' });
  assert.throws(() => run.die(), { name: 'RangeError' });
});

test("mort : on recommence l'étape avec les valeurs d'entrée, pas celles de la mort", () => {
  const run = new CampaignRun(SHORT, Campaign.START, NONE);
  run.win(knight(60, 2));
  run.leaveRest();
  assert.deepEqual(plain(run.checkpoint), { hp: 60, estus: 2 });
  run.carry = { hp: 0, estus: 0 };
  run.die();
  assert.deepEqual(plain(run.carry), { hp: 60, estus: 2 });
  assert.equal(run.step.id, 'gardien');
  assert.equal(run.deaths, 1);
  run.die();
  assert.deepEqual(plain(run.carry), { hp: 60, estus: 2 }, 'aucun cercle vicieux');
});

test('feu de camp : boire sans risque (soin exact, plafond, sans fiole refusé), seulement au feu', () => {
  const run = new CampaignRun(SHORT, Campaign.START, NONE);
  run.carry.hp = 50;
  assert.equal(run.drink(), false, 'pas pendant un combat, même blessé');
  run.carry.hp = 100;
  assert.throws(() => run.leaveRest(), { name: 'RangeError' });
  run.win(knight(40, 2));
  assert.throws(() => run.win(knight(40, 2)), { name: 'RangeError' }, 'aucun combat au feu de camp');
  assert.equal(run.drink(), true);
  assert.deepEqual(plain(run.carry), { hp: 40 + Combat.PLAYER.estus.heal, estus: 1 });
  run.carry.hp = 90;
  assert.equal(run.drink(), true);
  assert.deepEqual(plain(run.carry), { hp: 100, estus: 0 }, 'plafonné à la vie maximale');
  assert.equal(run.drink(), false, 'plus de fiole');
  run.carry.hp = 50;
  assert.equal(run.drink(), false, 'blessé mais sans fiole');
  assert.equal(run.carry.hp, 50);
  run.carry = { hp: 100, estus: 1 };
  assert.equal(run.drink(), false, 'vie pleine : la fiole est gardée');
  // Repos réglable (données) : vie rendue et fioles ravivées à l'arrivée au feu
  const r = new CampaignRun(SHORT, Campaign.START, { heal: 30, estus: 1 });
  r.win(knight(80, 0));
  assert.deepEqual(plain(r.carry), { hp: 100, estus: 1 });
  r.leaveRest();
  assert.deepEqual(plain(r.carry), { hp: 100, estus: 1 }, 'rien de plus en repartant');
});

test('un niveau 2 s\'ajoute par des données ; les combats reçoivent la vie et les fioles reportées', () => {
  const steps = [
    { id: 'meute', kind: 'pack', label: 'Niveau 1', intro: '' },
    { id: 'meute2', kind: 'pack', label: 'Niveau 2', intro: '', options: { size: 7 } },
    { id: 'gardien', kind: 'boss', label: 'Gardien', intro: '' }
  ];
  const run = new CampaignRun(steps);
  run.win(knight(70, 1));
  assert.equal(run.step.options.size, 7);
  assert.equal(run.progress(), 'Étape 2 / 3');
  // Les combats démarrent avec la vie reportée (bornée à [1, vie max])
  const arena = new Arena();
  const pf = new PackFight({ arena, size: run.step.options.size, playerController: idle, packController: new HandPackController(), estus: run.carry.estus, playerHp: run.carry.hp });
  assert.equal(pf.player.hp, 70);
  assert.equal(pf.player.estus, 1);
  assert.equal(pf.creux.length, 7);
  const bf = new Fight({ arena, playerController: idle, bossController: new HandBossController(), estus: 0, playerHp: 250 });
  assert.equal(bf.player.hp, bf.player.maxHp);
  const big = new PackFight({ arena, size: 3, playerController: idle, packController: new HandPackController(), playerHp: 250 });
  assert.equal(big.player.hp, big.player.maxHp, 'vie reportée bornée (meute)');
  assert.equal(new Fight({ arena, playerController: idle, bossController: new HandBossController(), playerHp: 0 }).player.hp, 1);
  assert.equal(new Fight({ arena, playerController: idle, bossController: new HandBossController() }).player.hp, Combat.PLAYER.maxHp, 'sans report : vie pleine');
});

test('campagne simulée avec le joueur robot : invariants à chaque étape', () => {
  const arena = new Arena();
  const run = new CampaignRun();
  let guard = 0;
  while (!run.done && guard++ < 10) {
    const s = run.step;
    if (s.kind === 'rest') { while (run.drink()); run.leaveRest(); continue; }
    const f = s.kind === 'pack'
      ? new PackFight({ arena, size: 3, maxTime: 60, playerController: new PackPlayerController(seededRandom(guard)), packController: new HandPackController(),
        estus: run.carry.estus, playerHp: run.carry.hp, seed: guard })
      : new Fight({ arena, maxTime: 30, playerController: idle, bossController: new HandBossController(), estus: run.carry.estus, playerHp: run.carry.hp, seed: guard });
    assert.equal(f.player.hp, run.carry.hp);
    const r = f.run();
    if (r.winner === 'player') run.win(f.player);
    else { run.die(); break; }
    assert.ok(run.carry.hp >= 1 && run.carry.hp <= 100 && run.carry.estus >= 0);
  }
  assert.ok(guard < 10);
  assert.ok(run.deaths <= 1);
});
