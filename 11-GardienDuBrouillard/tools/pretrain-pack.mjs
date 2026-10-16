// Pré-entraînement de la meute des Creux sous Node (sans rendu), pour que le niveau 1 ait une meute apprise
// dès l'ouverture de la page. Écrit pretrainedPack.js (données).
//
// Usage, depuis le dossier de l'exemple :
//   node tools/pretrain-pack.mjs [générations] [graine] [--dry]
// --dry : n'écrit rien (essai). Le cerveau retenu est le champion validé ; il est ensuite comparé à la meute
// écrite à la main sur PackSettings.COMPARISON_FIGHTS combats d'examen neufs (graines EXAM_SEED et suivantes).
import { writeFileSync } from 'node:fs';
import { load, FILES } from '../tests/helpers.mjs';

const generations = Number(process.argv[2] || 60);
const seed = Number(process.argv[3] || 1);
const dry = process.argv.includes('--dry');
const EXAM_SEED = 960000;
const { get } = load(seed, FILES, { thisContext: true });
const Settings = get('Settings'), PackSettings = get('PackSettings'), PackTraining = get('PackTraining');
const HandPackController = get('HandPackController'), NeuralPackController = get('NeuralPackController');
const Arena = get('Arena');

const settings = Object.assign(Settings.defaults(), PackSettings.defaults(), { maxFightTime: 60 });
const training = new PackTraining(settings, { seed });
const start = Date.now();
// Petits paquets de pas : un gros paquet enchaînerait plusieurs générations (les combats sont courts)
// et dépasserait le nombre de générations demandé
while (training.generation < generations) {
  training.work(2000);
  // Une génération est affichée une fois l'examen de ses candidats fini (le champion est alors connu)
  for (const h of training.history) if (!h.logged && (h !== training.history[training.history.length - 1] || training.phase === 'train')) {
    h.logged = true;
    console.log(`génération ${h.generation} : meilleure ${h.best.toFixed(1)}, moyenne ${h.mean.toFixed(1)}, ` +
      `victoires ${(h.winRate * 100).toFixed(0)} %, encerclé ${(h.surrounded * 100).toFixed(1)} %, champion ${(h.championWinRate * 100).toFixed(0)} %`);
  }
}
while (training.phase === 'validate') training.work(2000);
console.log(`champion : génération ${training.champion.generation}, ${(training.champion.winRate * 100).toFixed(0)} % de victoires ` +
  `sur ${PackTraining.VALIDATION_FIGHTS} combats de test (${training.generation} générations jouées)`);

const arena = new Arena();
function exam(makeController) {
  const results = [];
  for (let k = 0; k < PackSettings.COMPARISON_FIGHTS; k++) {
    results.push(PackTraining.makeFight(makeController(), EXAM_SEED + k, settings, arena).run());
  }
  return PackTraining.summary(results);
}
const brain = training.champion.brain;
const rows = [['Meute à la main', exam(() => new HandPackController())], ['Meute apprise', exam(() => new NeuralPackController(brain))]];
for (const [name, s] of rows) {
  console.log(`${name} : ${(s.winRate * 100).toFixed(0)} % de victoires, ${s.dealt.toFixed(0)} dégâts, ` +
    `${(s.killed * 100).toFixed(0)} % de pertes, chevalier encerclé ${(s.surrounded * 100).toFixed(1)} % du temps, couverture ${s.coverage.toFixed(2)}`);
}
console.log(`(${((Date.now() - start) / 1000).toFixed(0)} s)`);
if (dry) process.exit(0);

const round = s => ({ winRate: +s.winRate.toFixed(3), dealt: +s.dealt.toFixed(1), killed: +s.killed.toFixed(3), surrounded: +s.surrounded.toFixed(4), coverage: +s.coverage.toFixed(3) });
const data = {
  generations: training.generation, seed: seed, championGeneration: training.champion.generation, championWinRate: training.champion.winRate,
  history: training.history.map(h => ({ generation: h.generation, best: +h.best.toFixed(2), mean: +h.mean.toFixed(2), winRate: +h.winRate.toFixed(3), surrounded: +h.surrounded.toFixed(4), championWinRate: +h.championWinRate.toFixed(3) })),
  exam: { fights: PackSettings.COMPARISON_FIGHTS, seed: EXAM_SEED, hand: round(rows[0][1]), learned: round(rows[1][1]) },
  brain: JSON.parse(JSON.stringify(brain.toJSON()))
};
const text = '// Meute pré-entraînée : générée par `node tools/pretrain-pack.mjs ' + generations + ' ' + seed + '` (ne pas modifier à la main).\n' +
  'const PRETRAINED_PACK = ' + JSON.stringify(data) + ';\n';
writeFileSync(new URL('../pretrainedPack.js', import.meta.url), text);
console.log('pretrainedPack.js écrit');
