// Pré-entraînement du Panthéon sous Node : un boss par recette d'entraînement (doctrines.js),
// pour que le tournoi et les duels fonctionnent dès l'ouverture de la page. Écrit pretrainedPantheon.js.
// Le Gardien (recette de référence) n'est pas réentraîné : c'est le boss fourni (pretrainedBoss.js).
//
// Toutes les recettes partent de la MÊME population de départ (même graine) et du même nombre de
// générations : seule la recette change.
//
// Usage, depuis le dossier de l'exemple :
//   node tools/pretrain-pantheon.mjs [générations] [graine] [recette ...]
// Par défaut : 40 générations, graine 7, toutes les recettes sauf le Gardien. Une recette donnée seule
// remplace uniquement son boss dans le fichier existant.
// À la fin, le tournoi croisé est joué et affiché.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { load } from '../tests/helpers.mjs';

const generations = Number(process.argv[2] || 40);
const seed = Number(process.argv[3] || 7);
const files = ['vehicle.js', 'steering.js', 'combat.js', 'arena.js', 'NeuralNetwork.js', 'campfire.js', 'mistPatch.js', 'bloodstain.js', 'player.js',
  'boss.js', 'bossBrain.js', 'handBoss.js', 'scriptedPlayer.js', 'humanController.js', 'fight.js', 'fitness.js',
  'genetic.js', 'training.js', 'comparison.js', 'settings.js', 'trials.js', 'doctrines.js', 'pretrainedBoss.js', 'tournament.js'];
const { get } = load(seed, files, { thisContext: true });
const Training = get('Training'), Doctrines = get('Doctrines'), Trials = get('Trials'), CrossTournament = get('CrossTournament');
const HandBossController = get('HandBossController'), NeuralBossController = get('NeuralBossController'), NeuralNetwork = get('NeuralNetwork');
const PRETRAINED_BOSS = get('PRETRAINED_BOSS');

const ids = process.argv.slice(4).length ? process.argv.slice(4) : Doctrines.LIST.map(d => d.id).filter(id => id !== 'gardien');
const target = new URL('../pretrainedPantheon.js', import.meta.url);

// Fichier existant : on ne remplace que les recettes entraînées maintenant
let bosses = [];
if (existsSync(target)) {
  const text = readFileSync(target, 'utf8');
  bosses = JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;$/, '')).bosses;
}

const start = Date.now();
for (const id of ids) {
  const d = Doctrines.get(id);
  const training = new Training(Doctrines.settings(id), { seed, doctrine: id });
  while (training.generation < generations) training.work(200000);
  const last = training.history[training.history.length - 1];
  // Même choix final que tools/pretrain.mjs : 30 combats neufs, contre l'adversaire de la recette
  const candidates = training.lastTop.concat(training.champion ? [{ brain: training.champion.brain }] : []);
  const chosen = training.validate(candidates, 30, 950000);
  console.log(`${d.name} : ${generations} générations, dernière génération ${(last.winRate * 100).toFixed(0)} % de victoires, ` +
    `examen final ${(chosen.winRate * 100).toFixed(0)} % contre « ${Trials.get(d.trial).label} » (${((Date.now() - start) / 1000).toFixed(0)} s)`);
  bosses = bosses.filter(b => b.doctrine !== id);
  bosses.push({
    doctrine: id, generations, seed, validationWinRate: +chosen.winRate.toFixed(3),
    curve: training.history.map(h => +h.winRate.toFixed(3)),
    brain: JSON.parse(JSON.stringify(chosen.brain.toJSON()))
  });
}
// Ordre des recettes de doctrines.js
bosses.sort((a, b) => Doctrines.LIST.findIndex(d => d.id === a.doctrine) - Doctrines.LIST.findIndex(d => d.id === b.doctrine));

const text = '// Boss du Panthéon pré-entraînés : générés par `node tools/pretrain-pantheon.mjs` (ne pas modifier à la main).\n' +
  '// Un boss par recette d\'entraînement (doctrines.js), tous partis de la même population de départ.\n' +
  'const PRETRAINED_PANTHEON = ' + JSON.stringify({ bosses }) + ';\n';
writeFileSync(target, text);
console.log('pretrainedPantheon.js écrit');

// Tournoi croisé : boss à états, Gardien fourni et boss du Panthéon, contre chaque épreuve
const contenders = [{ name: 'Boss à états', makeController: () => new HandBossController() },
  { name: 'Le Gardien', brain: NeuralNetwork.fromJSON(PRETRAINED_BOSS.brain) }]
  .concat(bosses.map(b => ({ name: Doctrines.get(b.doctrine).name, brain: NeuralNetwork.fromJSON(b.brain) })))
  .map(c => c.makeController ? c : { name: c.name, makeController: () => new NeuralBossController(c.brain) });
const tournament = new CrossTournament(contenders, Trials.LIST.map(t => ({ id: t.id, label: t.label, settings: Trials.settings(t.id) })));
while (!tournament.done) tournament.work(1e6);
const grid = tournament.grid();
console.log('\nTournoi croisé (' + CrossTournament.FIGHTS + ' combats par case) — victoires du boss :');
console.log(''.padEnd(18) + Trials.LIST.map(t => t.label.padStart(11)).join('') + '   moyenne   frappes ruées souffles reçus fioles');
grid.forEach((row, i) => {
  const p = CrossTournament.profile(row);
  console.log(contenders[i].name.padEnd(18) + row.map(c => ((c.winRate * 100).toFixed(0) + ' %').padStart(11)).join('') +
    ((p.winRate * 100).toFixed(0) + ' %').padStart(10) + p.avgAttacks.toFixed(1).padStart(10) + p.avgCharges.toFixed(1).padStart(6) +
    p.avgBreaths.toFixed(1).padStart(9) + p.avgDamageTaken.toFixed(0).padStart(6) + p.avgDrinks.toFixed(1).padStart(7));
});
console.log(`(${((Date.now() - start) / 1000).toFixed(0)} s)`);
