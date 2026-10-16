// Pré-entraînement du boss sous Node (sans rendu), pour que le mode Combat ait un boss appris
// dès l'ouverture de la page. Écrit pretrainedBoss.js (données).
//
// Usage, depuis le dossier de l'exemple :
//   node tools/pretrain.mjs [générations] [graine]
// Par défaut : 60 générations, graine 1. Le boss fourni a été obtenu avec : node tools/pretrain.mjs 40 7
import { writeFileSync } from 'node:fs';
import { load } from '../tests/helpers.mjs';

const generations = Number(process.argv[2] || 60);
const seed = Number(process.argv[3] || 1);
const files = ['vehicle.js', 'steering.js', 'combat.js', 'arena.js', 'NeuralNetwork.js', 'campfire.js', 'mistPatch.js', 'bloodstain.js', 'player.js',
  'boss.js', 'bossBrain.js', 'handBoss.js', 'scriptedPlayer.js', 'humanController.js', 'fight.js', 'fitness.js',
  'genetic.js', 'training.js', 'comparison.js', 'settings.js', 'trials.js', 'doctrines.js'];
// Chargement dans le contexte principal de Node (bien plus rapide qu'un contexte vm isolé) ; l'entraînement
// n'utilise que des générateurs à graine injectés, il est donc reproductible.
const { get } = load(seed, files, { thisContext: true });
const Settings = get('Settings'), Training = get('Training'), Comparison = get('Comparison');
const HandBossController = get('HandBossController'), NeuralBossController = get('NeuralBossController');

const settings = Settings.defaults();
const training = new Training(settings, { seed });
const start = Date.now();
while (training.generation < generations) {
  training.work(200000);

  for (const h of training.history) if (!h.logged) {
    h.logged = true;
    console.log(`génération ${h.generation} : meilleure ${h.best.toFixed(1)}, moyenne ${h.mean.toFixed(1)}, victoires ${(h.winRate * 100).toFixed(0)} %`);
  }
}

// Le cerveau retenu : le champion validé pendant l'entraînement et les 5 meilleurs de la dernière
// génération sont rejoués sur 30 combats neufs ; on garde celui qui gagne le plus souvent.
const candidates = training.lastTop.concat(training.champion ? [{ brain: training.champion.brain }] : []);
const chosen = training.validate(candidates, 30, 950000);
console.log(`validation : ${(chosen.winRate * 100).toFixed(0)} % de victoires sur 30 combats`);
const brain = chosen.brain;
const comparison = new Comparison([
  { name: 'Boss à états', makeController: () => new HandBossController() },
  { name: 'Boss appris', makeController: () => new NeuralBossController(brain) }
], settings, Settings.COMPARISON_FIGHTS);
while (!comparison.done) comparison.work(500000);
const summary = comparison.summary();
for (const s of summary) {
  console.log(`${s.name} : ${(s.winRate * 100).toFixed(0)} % de victoires, durée moyenne ${s.avgDuration.toFixed(1)} s`);
}

const data = {
  generations: generations, seed: seed, validationWinRate: chosen.winRate,
  history: training.history.map(h => ({ generation: h.generation, best: +h.best.toFixed(2), mean: +h.mean.toFixed(2), winRate: +h.winRate.toFixed(3), championWinRate: +(h.championWinRate || 0).toFixed(3) })),
  comparison: summary.map(s => ({ name: s.name, winRate: s.winRate, avgDuration: +s.avgDuration.toFixed(2) })),
  brain: JSON.parse(JSON.stringify(brain.toJSON()))
};
const text = '// Boss pré-entraîné : généré par `node tools/pretrain.mjs ' + generations + ' ' + seed + '` (ne pas modifier à la main).\n' +
  '// Il sert de « meilleur boss » tant qu\'aucun entraînement n\'a été lancé dans la page.\n' +
  'const PRETRAINED_BOSS = ' + JSON.stringify(data) + ';\n';
writeFileSync(new URL('../pretrainedBoss.js', import.meta.url), text);
console.log(`pretrainedBoss.js écrit (${((Date.now() - start) / 1000).toFixed(0)} s)`);
